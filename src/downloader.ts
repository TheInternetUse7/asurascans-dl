import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { asuraFetch } from "./http.js";
import type { SPage } from "./types.js";
import { downloadAndDeobfuscate } from "./deobfuscate.js";

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

  const response = await asuraFetch(page.url, {}, { includeOrigin: false });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
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

  const limit = pLimit(options.concurrency ?? 5);
  const padLength = String(pages.length).length;

  await Promise.all(
    pages.map((page, pageIndex) =>
      limit(async () => {
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
          return;
        }

        try {
          const buffer = await downloadPageBuffer(page);
          await writeFile(filePath, buffer);
          downloadedPages += 1;
          options.onProgress?.({
            chapter: chapterNumber,
            page: pageIndex + 1,
            total: pages.length,
            status: "downloaded",
          });
        } catch (error) {
          failedPages += 1;
          options.onProgress?.({
            chapter: chapterNumber,
            page: pageIndex + 1,
            total: pages.length,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    ),
  );

  return {
    chapterDir,
    downloadedPages,
    skippedPages,
    failedPages,
    totalPages: pages.length,
  };
}
