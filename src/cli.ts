#!/usr/bin/env node

import path from "node:path";
import { resolveSeries, searchSeries } from "./api.js";
import { createChapterCbz } from "./archive.js";
import { fetchAllSeriesCatalog, readCatalogFile, selectCatalogSeries, writeCatalogFile } from "./catalog.js";
import { normalizeParsedArgs, parseArgs } from "./cli-options.js";
import { downloadChapter } from "./downloader.js";
import { getChapterDir, writeChapterMetadata, writeSeriesMetadata } from "./metadata.js";
import { PremiumChapterError, fetchChapterList, fetchChapterPages } from "./scraper.js";
import { selectChapters } from "./selection.js";
import {
  getCompletedSeriesSet,
  getDefaultStatePath,
  loadStateFile,
  saveStateFile,
  updateSeriesState,
} from "./tracking.js";
import type { TrackedChapterResult } from "./tracking.js";
import type { PremiumAuth, SChapter, SeriesRef } from "./types.js";

interface DownloadSummary {
  downloadedChapters: number;
  skippedChapters: number;
  failedChapters: number;
  plannedChapters: number;
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  plannedPages: number;
  cbzCreated: number;
}

interface DownloadRuntimeOptions {
  outputDir: string;
  concurrency: number;
  dryRun: boolean;
  writeCbz: boolean;
  overwrite: boolean;
  auth: PremiumAuth;
  chaptersSelector?: string;
}

interface SeriesExecutionResult {
  chapters: SChapter[];
  selected: SChapter[];
  chapterResults: TrackedChapterResult[];
  summary: DownloadSummary;
}

function createEmptySummary(): DownloadSummary {
  return {
    downloadedChapters: 0,
    skippedChapters: 0,
    failedChapters: 0,
    plannedChapters: 0,
    downloadedPages: 0,
    skippedPages: 0,
    failedPages: 0,
    plannedPages: 0,
    cbzCreated: 0,
  };
}

function addSummary(target: DownloadSummary, source: DownloadSummary): void {
  target.downloadedChapters += source.downloadedChapters;
  target.skippedChapters += source.skippedChapters;
  target.failedChapters += source.failedChapters;
  target.plannedChapters += source.plannedChapters;
  target.downloadedPages += source.downloadedPages;
  target.skippedPages += source.skippedPages;
  target.failedPages += source.failedPages;
  target.plannedPages += source.plannedPages;
  target.cbzCreated += source.cbzCreated;
}

function createChapterProgressReporter(
  chapterLabel: string,
  totalPages: number,
): {
  update: () => void;
  finish: () => void;
  isInline: boolean;
} {
  const isInline = Boolean(process.stdout.isTTY);

  if (!isInline) {
    console.log(`${chapterLabel} [0/${totalPages}]`);
    return {
      update: () => undefined,
      finish: () => undefined,
      isInline,
    };
  }

  let completedPages = 0;
  let previousLength = 0;

  const writeProgress = (): void => {
    const text = `${chapterLabel} [${completedPages}/${totalPages}]`;
    const padded = text.padEnd(previousLength);
    previousLength = Math.max(previousLength, text.length);
    process.stdout.write(`\r${padded}`);
  };

  writeProgress();

  return {
    update: () => {
      completedPages += 1;
      writeProgress();
    },
    finish: () => {
      process.stdout.write("\n");
    },
    isInline,
  };
}

function printHelp(): void {
  console.log(`Asura Scans downloader

Usage:
  asurascans-dl search <query>
  asurascans-dl info <slug-or-url>
  asurascans-dl download <slug-or-url> [--chapters <selector>] [--output <dir>] [--concurrency <n>] [--cookie <header>] [--overwrite] [--dry-run] [--cbz]
  asurascans-dl catalog export [--output <file>]
  asurascans-dl catalog download <catalog-file> [--series <selector>] [--state <file>] [--chapters <selector>] [--output <dir>] [--concurrency <n>] [--cookie <header>] [--overwrite] [--dry-run] [--cbz]

Examples:
  asurascans-dl search "iron-blooded"
  asurascans-dl info https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6
  asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 150-154 --output downloads
  asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters latest-public --dry-run
  asurascans-dl catalog export --output asura-catalog.json
  asurascans-dl catalog download asura-catalog.json --series pending --chapters latest-public
`);
}

function formatChapterTitle(chapter: SChapter): string {
  return chapter.title ? `Chapter ${chapter.numberText} - ${chapter.title}` : `Chapter ${chapter.numberText}`;
}

function parsePremiumAuth(cookieHeader?: string): PremiumAuth {
  const trimmed = cookieHeader?.trim();
  if (!trimmed) {
    return { enabled: false };
  }

  const accessToken = trimmed
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("access_token="))
    ?.slice("access_token=".length);

  return {
    cookieHeader: trimmed,
    accessToken,
    enabled: Boolean(accessToken),
  };
}

function getDefaultDownloadSelection(chapters: SChapter[], auth: PremiumAuth): SChapter[] {
  return selectChapters(chapters, auth.enabled ? "latest" : "latest-public");
}

function classifyChapterResult(result: {
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  totalPages: number;
}): "downloaded" | "skipped" | "failed" {
  if (result.downloadedPages === 0 && result.failedPages === 0 && result.skippedPages === result.totalPages) {
    return "skipped";
  }

  if (result.downloadedPages === 0 && result.failedPages === result.totalPages) {
    return "failed";
  }

  return "downloaded";
}

function printSeries(series: SeriesRef): void {
  console.log(`Title: ${series.title}`);
  console.log(`API slug: ${series.apiSlug}`);
  console.log(`Public slug: ${series.publicSlug}`);
  console.log(`URL: ${series.url}`);
  console.log(`Status: ${series.status}`);
  console.log(`Type: ${series.type || "unknown"}`);
  console.log(`Author: ${series.author || "unknown"}`);
  console.log(`Artist: ${series.artist || "unknown"}`);
  console.log(`Chapters: ${series.chapterCount}`);
  console.log(`Genres: ${series.genres.join(", ") || "none"}`);
}

function buildRuntimeOptions(options: Record<string, string | boolean>): DownloadRuntimeOptions {
  const outputDir = path.resolve(
    typeof options.output === "string" ? options.output : path.join(process.cwd(), "downloads"),
  );
  const concurrency = typeof options.concurrency === "string" ? Number(options.concurrency) : 5;

  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency must be a positive number.");
  }

  return {
    outputDir,
    concurrency,
    dryRun: options["dry-run"] === true,
    writeCbz: options.cbz === true,
    overwrite: options.overwrite === true,
    auth: parsePremiumAuth(typeof options.cookie === "string" ? options.cookie : undefined),
    chaptersSelector: typeof options.chapters === "string" ? options.chapters : undefined,
  };
}

async function executeSeriesDownload(
  series: SeriesRef,
  runtime: DownloadRuntimeOptions,
): Promise<SeriesExecutionResult> {
  const chapters = await fetchChapterList(series);
  const selected = runtime.chaptersSelector
    ? selectChapters(chapters, runtime.chaptersSelector)
    : getDefaultDownloadSelection(chapters, runtime.auth);

  if (selected.length === 0) {
    throw new Error("No chapters matched the requested selector.");
  }

  const summary = createEmptySummary();
  const chapterResults: TrackedChapterResult[] = [];

  if (!runtime.dryRun) {
    await writeSeriesMetadata(runtime.outputDir, series, chapters);
  }

  console.log(`Series: ${series.title}`);
  console.log(`Output: ${runtime.outputDir}`);
  console.log(`Requested chapters: ${selected.map((chapter) => chapter.numberText).join(", ")}`);
  if (runtime.dryRun) {
    console.log("Dry run: no files will be written.");
  } else {
    console.log("Series metadata: series.json");
  }
  if (runtime.writeCbz) {
    console.log(`CBZ output: ${runtime.dryRun ? "planned" : "enabled"}`);
  }

  for (const chapter of selected) {
    if (chapter.isLocked && !runtime.auth.enabled) {
      summary.skippedChapters += 1;
      console.log(`Skipping Chapter ${chapter.numberText}: locked and no access_token cookie was provided.`);
      chapterResults.push({
        chapter,
        status: "skipped",
        downloadedPages: 0,
        skippedPages: 0,
        failedPages: 0,
        note: "locked without access token",
      });
      continue;
    }

    try {
      const { pages, usedPremium } = await fetchChapterPages(series, chapter, runtime.auth);
      const chapterLabel = runtime.dryRun
        ? "Planned"
        : `Downloading Chapter ${chapter.numberText}${usedPremium ? " (premium)" : ""}`;
      if (runtime.dryRun) {
        console.log(`${chapterLabel} (${pages.length} pages${usedPremium ? ", premium" : ""})`);
      }

      if (runtime.dryRun) {
        summary.plannedChapters += 1;
        summary.plannedPages += pages.length;
        if (runtime.writeCbz) {
          summary.cbzCreated += 1;
        }
        chapterResults.push({
          chapter,
          status: "planned",
          downloadedPages: 0,
          skippedPages: 0,
          failedPages: 0,
          usedPremium,
          note: `planned ${pages.length} page download`,
        });
        continue;
      }

      const progressReporter = createChapterProgressReporter(chapterLabel, pages.length);
      let result;

      try {
        result = await downloadChapter(series.title, chapter.numberText, pages, {
          outputDir: runtime.outputDir,
          concurrency: runtime.concurrency,
          overwrite: runtime.overwrite,
          onProgress: (event) => {
            progressReporter.update();

            if (!progressReporter.isInline && event.status === "failed") {
              console.error(
                `  page ${event.page}/${event.total} failed for Chapter ${event.chapter}: ${event.error}`,
              );
            }
          },
        });
      } finally {
        progressReporter.finish();
      }

      summary.downloadedPages += result.downloadedPages;
      summary.skippedPages += result.skippedPages;
      summary.failedPages += result.failedPages;

      const chapterStatus = classifyChapterResult(result);
      if (chapterStatus === "downloaded") {
        summary.downloadedChapters += 1;
      } else if (chapterStatus === "skipped") {
        summary.skippedChapters += 1;
      } else {
        summary.failedChapters += 1;
      }

      let cbzPath: string | undefined;
      await writeChapterMetadata(runtime.outputDir, series, chapter, usedPremium, result);

      if (runtime.writeCbz) {
        const chapterDir = getChapterDir(runtime.outputDir, series, chapter.numberText);
        cbzPath = await createChapterCbz(chapterDir);
        summary.cbzCreated += 1;
        console.log(`Created CBZ: ${cbzPath}`);
      }

      chapterResults.push({
        chapter,
        status: chapterStatus,
        downloadedPages: result.downloadedPages,
        skippedPages: result.skippedPages,
        failedPages: result.failedPages,
        usedPremium,
        outputDir: result.chapterDir,
        cbzPath,
      });

      console.log(
        `Saved Chapter ${chapter.numberText} to ${result.chapterDir} (${result.downloadedPages} downloaded, ${result.skippedPages} skipped, ${result.failedPages} failed)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof PremiumChapterError && !runtime.auth.enabled) {
        summary.skippedChapters += 1;
        console.log(`Skipping Chapter ${chapter.numberText}: premium access is required.`);
        chapterResults.push({
          chapter,
          status: "skipped",
          downloadedPages: 0,
          skippedPages: 0,
          failedPages: 0,
          note: message,
        });
        continue;
      }

      summary.failedChapters += 1;
      console.error(`Failed to download Chapter ${chapter.numberText}: ${message}`);
      chapterResults.push({
        chapter,
        status: "failed",
        downloadedPages: 0,
        skippedPages: 0,
        failedPages: 0,
        note: message,
      });
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`  chapters downloaded: ${summary.downloadedChapters}`);
  console.log(`  chapters skipped: ${summary.skippedChapters}`);
  console.log(`  chapters failed: ${summary.failedChapters}`);
  if (runtime.dryRun) {
    console.log(`  chapters planned: ${summary.plannedChapters}`);
  }
  console.log(`  pages downloaded: ${summary.downloadedPages}`);
  console.log(`  pages skipped: ${summary.skippedPages}`);
  console.log(`  pages failed: ${summary.failedPages}`);
  if (runtime.dryRun) {
    console.log(`  pages planned: ${summary.plannedPages}`);
  }
  if (runtime.writeCbz) {
    console.log(`  cbz created: ${summary.cbzCreated}`);
  }

  return {
    chapters,
    selected,
    chapterResults,
    summary,
  };
}

async function handleSearch(queryParts: string[]): Promise<void> {
  const query = queryParts.join(" ").trim();
  if (!query) {
    throw new Error("search requires a query string.");
  }

  const results = await searchSeries(query);
  if (results.results.length === 0) {
    console.log("No results found.");
    return;
  }

  results.results.forEach((series, index) => {
    console.log(`${index + 1}. ${series.title}`);
    console.log(`   api: ${series.apiSlug}`);
    console.log(`   public: ${series.publicSlug}`);
    console.log(`   status: ${series.status}`);
    console.log(`   chapters: ${series.chapterCount}`);
  });

  if (results.hasMore) {
    console.log("More results are available from the API.");
  }
}

async function handleInfo(input: string): Promise<void> {
  const series = await resolveSeries(input);
  const chapters = await fetchChapterList(series);
  const lockedCount = chapters.filter((chapter) => chapter.isLocked).length;
  const publicCount = chapters.length - lockedCount;

  printSeries(series);
  console.log(`Public chapters: ${publicCount}`);
  console.log(`Locked chapters: ${lockedCount}`);

  const latest = [...chapters].sort((a, b) => b.number - a.number)[0];
  if (latest) {
    console.log(`Latest chapter: ${formatChapterTitle(latest)}`);
  }
}

async function handleDownload(input: string, options: Record<string, string | boolean>): Promise<void> {
  const series = await resolveSeries(input);
  const runtime = buildRuntimeOptions(options);
  await executeSeriesDownload(series, runtime);
}

async function handleCatalogExport(options: Record<string, string | boolean>): Promise<void> {
  const outputPath =
    typeof options.output === "string" ? options.output : path.join(process.cwd(), "asura-catalog.json");
  const catalog = await fetchAllSeriesCatalog();
  const writtenPath = await writeCatalogFile(outputPath, catalog);

  console.log(`Catalog written: ${writtenPath}`);
  console.log(`Series exported: ${catalog.series.length}`);
}

async function handleCatalogDownload(
  catalogPath: string,
  options: Record<string, string | boolean>,
): Promise<void> {
  const catalog = await readCatalogFile(catalogPath);
  const statePath = typeof options.state === "string" ? path.resolve(options.state) : getDefaultStatePath(catalogPath);
  const state = await loadStateFile(statePath);
  const runtime = buildRuntimeOptions(options);
  const selectedSeries = selectCatalogSeries(
    catalog,
    typeof options.series === "string" ? options.series : undefined,
    getCompletedSeriesSet(state),
  );

  if (selectedSeries.length === 0) {
    console.log("No series matched the catalog selector.");
    return;
  }

  const aggregate = createEmptySummary();
  console.log(`Catalog: ${path.resolve(catalogPath)}`);
  console.log(`Tracking state: ${statePath}`);
  console.log(`Series selected: ${selectedSeries.length}`);

  for (const [index, series] of selectedSeries.entries()) {
    console.log("");
    console.log(`[${index + 1}/${selectedSeries.length}] ${series.title}`);

    const result = await executeSeriesDownload(series, runtime);
    addSummary(aggregate, result.summary);

    if (!runtime.dryRun) {
      updateSeriesState(state, series, result.chapters, result.chapterResults, catalogPath);
      await saveStateFile(statePath, state);
    }
  }

  console.log("");
  console.log("Catalog Summary");
  console.log(`  series processed: ${selectedSeries.length}`);
  console.log(`  chapters downloaded: ${aggregate.downloadedChapters}`);
  console.log(`  chapters skipped: ${aggregate.skippedChapters}`);
  console.log(`  chapters failed: ${aggregate.failedChapters}`);
  if (runtime.dryRun) {
    console.log(`  chapters planned: ${aggregate.plannedChapters}`);
  }
  console.log(`  pages downloaded: ${aggregate.downloadedPages}`);
  console.log(`  pages skipped: ${aggregate.skippedPages}`);
  console.log(`  pages failed: ${aggregate.failedPages}`);
  if (runtime.dryRun) {
    console.log(`  pages planned: ${aggregate.plannedPages}`);
  }
  if (runtime.writeCbz) {
    console.log(`  cbz created: ${aggregate.cbzCreated}`);
  }
  if (!runtime.dryRun) {
    console.log(`State updated: ${statePath}`);
  }
}

async function main(): Promise<void> {
  const parsed = normalizeParsedArgs(parseArgs(process.argv.slice(2)));

  if (!parsed.command || parsed.command === "help" || parsed.command === "--help") {
    printHelp();
    return;
  }

  switch (parsed.command) {
    case "search":
      await handleSearch(parsed.positionals);
      return;
    case "info":
      if (parsed.positionals.length === 0) {
        throw new Error("info requires a slug or URL.");
      }
      await handleInfo(parsed.positionals[0]);
      return;
    case "download":
      if (parsed.positionals.length === 0) {
        throw new Error("download requires a slug or URL.");
      }
      await handleDownload(parsed.positionals[0], parsed.options);
      return;
    case "catalog":
      if (parsed.positionals.length === 0) {
        throw new Error("catalog requires a subcommand: export or download.");
      }

      if (parsed.positionals[0] === "export") {
        await handleCatalogExport(parsed.options);
        return;
      }

      if (parsed.positionals[0] === "download") {
        if (!parsed.positionals[1]) {
          throw new Error("catalog download requires a catalog file path.");
        }
        await handleCatalogDownload(parsed.positionals[1], parsed.options);
        return;
      }

      throw new Error(`Unknown catalog subcommand: ${parsed.positionals[0]}`);
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printHelp();
  process.exitCode = 1;
});
