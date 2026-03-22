import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeFilename } from "./downloader.js";
import type { ChapterMetadata, SChapter, SeriesMetadata, SeriesRef } from "./types.js";

export function getSeriesDir(outputDir: string, series: SeriesRef): string {
  return path.join(outputDir, sanitizeFilename(series.title));
}

export function getChapterDir(outputDir: string, series: SeriesRef, chapterNumber: string): string {
  return path.join(getSeriesDir(outputDir, series), `Chapter ${chapterNumber}`);
}

export function getChapterMetadataPath(
  outputDir: string,
  series: SeriesRef,
  chapterNumber: string,
  archiveOnly = false,
): string {
  const chapterDir = getChapterDir(outputDir, series, chapterNumber);
  return archiveOnly ? `${chapterDir}.json` : path.join(chapterDir, "chapter.json");
}

function getChapterUrl(series: SeriesRef, chapter: SChapter): string {
  return `${series.url}/chapter/${chapter.numberText}`;
}

export async function writeSeriesMetadata(
  outputDir: string,
  series: SeriesRef,
  chapters: SChapter[],
): Promise<string> {
  const seriesDir = getSeriesDir(outputDir, series);
  const latest = [...chapters].sort((left, right) => right.number - left.number)[0];
  const metadata: SeriesMetadata = {
    series: {
      title: series.title,
      apiSlug: series.apiSlug,
      publicSlug: series.publicSlug,
      url: series.url,
      author: series.author,
      artist: series.artist,
      description: series.description,
      cover: series.cover,
      status: series.status,
      type: series.type,
      genres: series.genres,
      chapterCount: series.chapterCount,
    },
    chapters: {
      total: chapters.length,
      public: chapters.filter((chapter) => !chapter.isLocked).length,
      locked: chapters.filter((chapter) => chapter.isLocked).length,
      latest: latest?.numberText,
    },
    generatedAt: new Date().toISOString(),
  };

  await mkdir(seriesDir, { recursive: true });
  const outputPath = path.join(seriesDir, "series.json");
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function writeChapterMetadata(
  outputDir: string,
  series: SeriesRef,
  chapter: SChapter,
  usedPremium: boolean,
  result: {
    downloadedPages: number;
    skippedPages: number;
    failedPages: number;
    totalPages: number;
  },
  options: {
    archiveOnly?: boolean;
  } = {},
): Promise<string> {
  const metadata: ChapterMetadata = {
    series: {
      title: series.title,
      apiSlug: series.apiSlug,
      publicSlug: series.publicSlug,
      url: series.url,
    },
    chapter: {
      number: chapter.numberText,
      title: chapter.title,
      url: getChapterUrl(series, chapter),
      createdAt: chapter.createdAt,
      isLocked: chapter.isLocked,
      usedPremium,
    },
    pages: {
      total: result.totalPages,
      downloaded: result.downloadedPages,
      skipped: result.skippedPages,
      failed: result.failedPages,
    },
    generatedAt: new Date().toISOString(),
  };

  const outputPath = getChapterMetadataPath(outputDir, series, chapter.numberText, options.archiveOnly === true);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return outputPath;
}
