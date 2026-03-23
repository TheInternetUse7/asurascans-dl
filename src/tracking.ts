import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomically } from "./atomic-write.js";
import type {
  ChapterDownloadState,
  DownloadStateFile,
  SChapter,
  SeriesDownloadState,
  SeriesRef,
} from "./types.js";

export interface TrackedChapterResult {
  chapter: SChapter;
  status: "downloaded" | "skipped" | "failed" | "planned";
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  usedPremium?: boolean;
  outputDir?: string;
  cbzPath?: string;
  note?: string;
}

export function getDefaultStatePath(catalogPath: string): string {
  const resolved = path.resolve(catalogPath);
  const extension = path.extname(resolved);
  if (!extension) {
    return `${resolved}.state.json`;
  }

  return `${resolved.slice(0, -extension.length)}.state.json`;
}

export async function loadStateFile(statePath: string): Promise<DownloadStateFile> {
  const resolvedPath = path.resolve(statePath);

  try {
    const contents = await readFile(resolvedPath, "utf8");
    return JSON.parse(contents) as DownloadStateFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      series: {},
    };
  }
}

export async function saveStateFile(statePath: string, state: DownloadStateFile): Promise<string> {
  const resolvedPath = path.resolve(statePath);
  state.updatedAt = new Date().toISOString();
  await writeFileAtomically(resolvedPath, `${JSON.stringify(state, null, 2)}\n`);
  return resolvedPath;
}

export function updateSeriesState(
  state: DownloadStateFile,
  series: SeriesRef,
  chapters: SChapter[],
  results: TrackedChapterResult[],
  catalogPath?: string,
): DownloadStateFile {
  const now = new Date().toISOString();
  if (catalogPath) {
    state.catalogPath = path.resolve(catalogPath);
  }

  const previous = state.series[series.apiSlug];
  const chapterMap: Record<string, ChapterDownloadState> = {
    ...(previous?.chapters ?? {}),
  };

  for (const result of results) {
    chapterMap[result.chapter.numberText] = {
      status: result.status,
      outputDir: result.outputDir,
      cbzPath: result.cbzPath,
      downloadedPages: result.downloadedPages,
      skippedPages: result.skippedPages,
      failedPages: result.failedPages,
      usedPremium: result.usedPremium,
      updatedAt: now,
      note: result.note,
    };
  }

  const downloadedChapterCount = Object.values(chapterMap).filter((entry) => entry.status === "downloaded").length;
  const failedCount = Object.values(chapterMap).filter((entry) => entry.status === "failed").length;
  const complete = chapters.length > 0 && chapters.every((chapter) => chapterMap[chapter.numberText]?.status === "downloaded");
  const hasSuccessfulResult = results.some((entry) => entry.status === "downloaded");

  const seriesState: SeriesDownloadState = {
    title: series.title,
    apiSlug: series.apiSlug,
    publicSlug: series.publicSlug,
    status: complete ? "complete" : failedCount > 0 ? "failed" : downloadedChapterCount > 0 ? "partial" : "pending",
    knownChapterCount: chapters.length,
    downloadedChapterCount,
    lastAttemptAt: now,
    lastSuccessAt: hasSuccessfulResult ? now : previous?.lastSuccessAt,
    note: previous?.note,
    chapters: chapterMap,
  };

  state.series[series.apiSlug] = seriesState;
  return state;
}

export function updateSeriesFailureState(
  state: DownloadStateFile,
  series: SeriesRef,
  note: string,
  catalogPath?: string,
): DownloadStateFile {
  const now = new Date().toISOString();
  if (catalogPath) {
    state.catalogPath = path.resolve(catalogPath);
  }

  const previous = state.series[series.apiSlug];
  state.series[series.apiSlug] = {
    title: series.title,
    apiSlug: series.apiSlug,
    publicSlug: series.publicSlug,
    status: "failed",
    knownChapterCount: previous?.knownChapterCount ?? 0,
    downloadedChapterCount: previous?.downloadedChapterCount ?? 0,
    lastAttemptAt: now,
    lastSuccessAt: previous?.lastSuccessAt,
    note,
    chapters: {
      ...(previous?.chapters ?? {}),
    },
  };

  return state;
}

export function getCompletedSeriesSet(state: DownloadStateFile): Set<string> {
  return new Set(
    Object.values(state.series)
      .filter((series) => series.status === "complete")
      .map((series) => series.apiSlug),
  );
}
