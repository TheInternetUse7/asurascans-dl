#!/usr/bin/env node

import path from "node:path";
import { resolveSeries, searchSeries } from "./api.js";
import { downloadChapter } from "./downloader.js";
import { PremiumChapterError, fetchChapterList, fetchChapterPages } from "./scraper.js";
import { selectChapters } from "./selection.js";
import type { PremiumAuth, SChapter, SeriesRef } from "./types.js";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  options: Record<string, string | boolean>;
}

interface DownloadSummary {
  downloadedChapters: number;
  skippedChapters: number;
  failedChapters: number;
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
}

function printHelp(): void {
  console.log(`Asura Scans downloader

Usage:
  asurascan-dl search <query>
  asurascan-dl info <slug-or-url>
  asurascan-dl download <slug-or-url> [--chapters <selector>] [--output <dir>] [--concurrency <n>] [--cookie <header>] [--overwrite]

Examples:
  asurascan-dl search "iron-blooded"
  asurascan-dl info https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6
  asurascan-dl download revenge-of-the-iron-blooded-sword-hound --chapters 150-154 --output downloads
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const name = token.slice(2);

    if (name === "overwrite") {
      options[name] = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${name} requires a value.`);
    }

    options[name] = value;
    index += 1;
  }

  return {
    command,
    positionals,
    options,
  };
}

function formatChapterTitle(chapter: SChapter): string {
  return chapter.title ? `Chapter ${chapter.numberText} - ${chapter.title}` : `Chapter ${chapter.numberText}`;
}

function parsePremiumAuth(cookieHeader?: string): PremiumAuth {
  const trimmed = cookieHeader?.trim();
  if (!trimmed) {
    return { enabled: false };
  }

  // Reuse a browser-exported Cookie header instead of implementing account login in the CLI.
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
  const chapters = await fetchChapterList(series);
  const selector = typeof options.chapters === "string" ? options.chapters : "latest";
  const selected = selectChapters(chapters, selector);

  if (selected.length === 0) {
    throw new Error("No chapters matched the requested selector.");
  }

  const outputDir = path.resolve(
    typeof options.output === "string" ? options.output : path.join(process.cwd(), "downloads"),
  );
  const concurrency = typeof options.concurrency === "string" ? Number(options.concurrency) : 5;

  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency must be a positive number.");
  }

  const auth = parsePremiumAuth(typeof options.cookie === "string" ? options.cookie : undefined);
  const summary: DownloadSummary = {
    downloadedChapters: 0,
    skippedChapters: 0,
    failedChapters: 0,
    downloadedPages: 0,
    skippedPages: 0,
    failedPages: 0,
  };

  console.log(`Series: ${series.title}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Requested chapters: ${selected.map((chapter) => chapter.numberText).join(", ")}`);

  for (const chapter of selected) {
    if (chapter.isLocked && !auth.enabled) {
      summary.skippedChapters += 1;
      console.log(`Skipping Chapter ${chapter.numberText}: locked and no access_token cookie was provided.`);
      continue;
    }

    try {
      const { pages, usedPremium } = await fetchChapterPages(series, chapter, auth);
      console.log(
        `Downloading Chapter ${chapter.numberText} (${pages.length} pages${usedPremium ? ", premium" : ""})`,
      );

      const result = await downloadChapter(series.title, chapter.numberText, pages, {
        outputDir,
        concurrency,
        overwrite: options.overwrite === true,
        onProgress: (event) => {
          if (event.status === "failed") {
            console.error(
              `  page ${event.page}/${event.total} failed for Chapter ${event.chapter}: ${event.error}`,
            );
          }
        },
      });

      summary.downloadedChapters += 1;
      summary.downloadedPages += result.downloadedPages;
      summary.skippedPages += result.skippedPages;
      summary.failedPages += result.failedPages;

      console.log(
        `Saved Chapter ${chapter.numberText} to ${result.chapterDir} (${result.downloadedPages} downloaded, ${result.skippedPages} skipped, ${result.failedPages} failed)`,
      );
    } catch (error) {
      if (error instanceof PremiumChapterError && !auth.enabled) {
        summary.skippedChapters += 1;
        console.log(`Skipping Chapter ${chapter.numberText}: premium access is required.`);
        continue;
      }

      summary.failedChapters += 1;
      console.error(
        `Failed to download Chapter ${chapter.numberText}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`  chapters downloaded: ${summary.downloadedChapters}`);
  console.log(`  chapters skipped: ${summary.skippedChapters}`);
  console.log(`  chapters failed: ${summary.failedChapters}`);
  console.log(`  pages downloaded: ${summary.downloadedPages}`);
  console.log(`  pages skipped: ${summary.skippedPages}`);
  console.log(`  pages failed: ${summary.failedPages}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

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
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printHelp();
  process.exitCode = 1;
});
