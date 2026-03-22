import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeChapterMetadata, writeSeriesMetadata } from "../src/metadata.js";
import type { SChapter, SeriesRef } from "../src/types.js";

const series: SeriesRef = {
  input: "series-slug",
  apiSlug: "series-slug",
  publicSlug: "series-public",
  url: "https://asurascans.com/comics/series-public",
  title: "Series Title",
  author: "Author",
  artist: "Artist",
  description: "Description",
  cover: "https://cdn.example/cover.webp",
  status: "ongoing",
  genres: ["Action"],
  chapterCount: 2,
  type: "manhwa",
};

const chapter: SChapter = {
  number: 154,
  numberText: "154",
  title: "Chapter Title",
  createdAt: "2026-03-15T15:48:33Z",
  isLocked: false,
  seriesSlug: "series-slug",
  url: "/series/series-slug/chapter/154",
};

test("writeSeriesMetadata writes series.json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascan-series-"));
  const outputPath = await writeSeriesMetadata(tempDir, series, [chapter]);
  const data = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(data.series.title, "Series Title");
  assert.equal(data.series.publicSlug, "series-public");
  assert.equal(data.chapters.public, 1);
  assert.equal(data.chapters.latest, "154");
});

test("writeChapterMetadata writes chapter.json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascan-chapter-"));
  const outputPath = await writeChapterMetadata(tempDir, series, chapter, false, {
    downloadedPages: 14,
    skippedPages: 0,
    failedPages: 0,
    totalPages: 14,
  });
  const data = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(data.chapter.number, "154");
  assert.equal(data.chapter.usedPremium, false);
  assert.equal(data.pages.total, 14);
});

test("writeChapterMetadata writes a sidecar json when archiveOnly is enabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascans-chapter-cbz-"));
  const outputPath = await writeChapterMetadata(tempDir, series, chapter, false, {
    downloadedPages: 14,
    skippedPages: 0,
    failedPages: 0,
    totalPages: 14,
  }, {
    archiveOnly: true,
  });
  const data = JSON.parse(await readFile(outputPath, "utf8"));

  assert.ok(outputPath.endsWith("Chapter 154.json"));
  assert.equal(data.chapter.number, "154");
  assert.equal(data.pages.total, 14);
});
