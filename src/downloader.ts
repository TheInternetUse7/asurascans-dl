import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { asuraFetch } from "./http.js";
import type { SPage } from "./types.js";
import { downloadAndDeobfuscate } from "./deobfuscate.js";

const PAGE_RETRY_ATTEMPTS = 6;
const RECOVERY_PASS_COUNT = 2;
const RECOVERY_BASE_DELAY_MS = 5000;

export interface DownloadProgressEvent {
  chapter: string;
  page: number;
  total: number;
  status: "downloaded" | "skipped" | "failed";
  error?: string;
}

export interface DownloadOptions {
  outputDir: string;
  concurrency?: number;
  overwrite?: boolean;
  onProgress?: (event: DownloadProgressEvent) => void;
}

export interface DownloadChapterResult {
  chapterDir: string;
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  totalPages: number;
}

interface PendingPageDownload {
  page: SPage;
  pageIndex: number;
  filePath: string;
}

function getFileExtension(url: string): string | null {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.(webp|png|jpg|jpeg|gif)$/i);
  return match ? match[0].toLowerCase() : null;
}

async function downloadPageBuffer(page: SPage): Promise<Buffer> {
  if (page.tiles?.length && page.tileCols && page.tileRows) {
    // Tiled pages must be reconstructed before writing; plain pages can be streamed directly.
    return downloadAndDeobfuscate(page.url, page.tiles, page.tileCols, page.tileRows);
  }

  const response = await asuraFetch(page.url, {}, { includeOrigin: false, retryAttempts: PAGE_RETRY_ATTEMPTS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
}

export function isTransientDownloadErrorMessage(message: string): boolean {
  return /\b(408|429|500|502|503|504|520|521|522|523|524)\b/.test(message)
    || /(fetch failed|network|timed out|timeout|econnreset|socket hang up|connection reset)/i.test(message);
}

export function getRecoveryDelayMs(recoveryPass: number): number {
  return RECOVERY_BASE_DELAY_MS * 2 ** Math.max(0, recoveryPass - 1);
}

export async function downloadChapter(
  mangaTitle: string,
  chapterNumber: string,
  pages: SPage[],
  options: DownloadOptions,
): Promise<DownloadChapterResult> {
  const chapterDir = path.join(
    options.outputDir,
    sanitizeFilename(mangaTitle),
    `Chapter ${chapterNumber}`,
  );

  await mkdir(chapterDir, { recursive: true });

  let downloadedPages = 0;
  let skippedPages = 0;
  let failedPages = 0;

  const padLength = String(pages.length).length;
  const pendingDownloads: PendingPageDownload[] = [];

  for (const [pageIndex, page] of pages.entries()) {
    const extension =
      page.tiles?.length && page.tileCols && page.tileRows
        ? ".webp"
        : getFileExtension(page.url) ?? ".webp";
    const filename = `${String(pageIndex + 1).padStart(padLength, "0")}${extension}`;
    const filePath = path.join(chapterDir, filename);

    if (!options.overwrite && existsSync(filePath)) {
      // Resume mode is file-based so reruns can pick up partially completed chapters cheaply.
      skippedPages += 1;
      options.onProgress?.({
        chapter: chapterNumber,
        page: pageIndex + 1,
        total: pages.length,
        status: "skipped",
      });
      continue;
    }

    pendingDownloads.push({
      page,
      pageIndex,
      filePath,
    });
  }

  let retryQueue = pendingDownloads;

  for (let recoveryPass = 0; recoveryPass <= RECOVERY_PASS_COUNT && retryQueue.length > 0; recoveryPass += 1) {
    if (recoveryPass > 0) {
      await sleep(getRecoveryDelayMs(recoveryPass));
    }

    const passConcurrency = recoveryPass === 0 ? options.concurrency ?? 5 : 1;
    const limit = pLimit(passConcurrency);
    const nextRetryQueue: PendingPageDownload[] = [];

    await Promise.all(
      retryQueue.map((item) =>
        limit(async () => {
          try {
            const buffer = await downloadPageBuffer(item.page);
            await writeFile(item.filePath, buffer);
            downloadedPages += 1;
            options.onProgress?.({
              chapter: chapterNumber,
              page: item.pageIndex + 1,
              total: pages.length,
              status: "downloaded",
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const shouldRetry =
              recoveryPass < RECOVERY_PASS_COUNT
              && isTransientDownloadErrorMessage(message);

            if (shouldRetry) {
              nextRetryQueue.push(item);
              return;
            }

            failedPages += 1;
            options.onProgress?.({
              chapter: chapterNumber,
              page: item.pageIndex + 1,
              total: pages.length,
              status: "failed",
              error: message,
            });
          }
        }),
      ),
    );

    retryQueue = nextRetryQueue;
  }

  return {
    chapterDir,
    downloadedPages,
    skippedPages,
    failedPages,
    totalPages: pages.length,
  };
}
