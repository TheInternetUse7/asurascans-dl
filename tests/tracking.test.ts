import assert from "node:assert/strict";
import test from "node:test";
import { getCompletedSeriesSet, getDefaultStatePath, updateSeriesState } from "../src/tracking.js";
import type { DownloadStateFile, SChapter, SeriesRef } from "../src/types.js";

const series: SeriesRef = {
  input: "alpha",
  apiSlug: "alpha",
  publicSlug: "alpha-public",
  url: "https://asurascans.com/comics/alpha-public",
  title: "Alpha",
  author: "",
  artist: "",
  description: "",
  cover: "",
  status: "ongoing",
  genres: [],
  chapterCount: 2,
  type: "manhwa",
};

const chapters: SChapter[] = [
  {
    number: 1,
    numberText: "1",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "alpha",
    url: "/series/alpha/chapter/1",
  },
  {
    number: 2,
    numberText: "2",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "alpha",
    url: "/series/alpha/chapter/2",
  },
];

test("getDefaultStatePath derives a sibling state file", () => {
  assert.ok(getDefaultStatePath("catalog.json").endsWith("catalog.state.json"));
});

test("updateSeriesState records chapter progress and completion", () => {
  const state: DownloadStateFile = {
    version: 1,
    updatedAt: "2026-03-22T00:00:00.000Z",
    series: {},
  };

  updateSeriesState(
    state,
    series,
    chapters,
    [
      {
        chapter: chapters[0]!,
        status: "downloaded",
        downloadedPages: 12,
        skippedPages: 0,
        failedPages: 0,
        outputDir: "downloads/Alpha/Chapter 1",
      },
      {
        chapter: chapters[1]!,
        status: "downloaded",
        downloadedPages: 10,
        skippedPages: 0,
        failedPages: 0,
        outputDir: "downloads/Alpha/Chapter 2",
      },
    ],
    "catalog.json",
  );

  assert.equal(state.series.alpha?.status, "complete");
  assert.equal(state.series.alpha?.downloadedChapterCount, 2);
  assert.deepEqual([...getCompletedSeriesSet(state)], ["alpha"]);
  assert.equal(state.series.alpha?.chapters["1"]?.status, "downloaded");
});
