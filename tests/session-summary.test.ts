import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSessionSummary,
  recordFailedSessionSeries,
  updateSessionSummary,
  writeSessionSummary,
} from "../src/session-summary.js";
import type { SeriesRef } from "../src/types.js";

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

test("updateSessionSummary tracks per-series progress and aggregate totals", () => {
  const session = createSessionSummary({
    mode: "catalog-download",
    outputDir: "downloads",
    concurrency: 4,
    dryRun: false,
    overwrite: false,
    writeCbz: false,
    requestedSeriesCount: 2,
    catalogPath: "catalog.json",
    statePath: "catalog.state.json",
    startedAt: "2026-03-23T00:00:00.000Z",
  });

  updateSessionSummary(session, {
    series,
    selectedChapterNumbers: ["1", "2"],
    chapterResults: [
      {
        chapter: {
          number: 1,
          numberText: "1",
          title: "",
          createdAt: "",
          isLocked: false,
          seriesSlug: "alpha",
          url: "",
        },
        status: "downloaded",
        downloadedPages: 12,
        skippedPages: 0,
        failedPages: 0,
      },
    ],
    totals: {
      downloadedChapters: 1,
      skippedChapters: 0,
      failedChapters: 0,
      plannedChapters: 0,
      downloadedPages: 12,
      skippedPages: 0,
      failedPages: 0,
      plannedPages: 0,
      cbzCreated: 0,
    },
    completed: false,
  }, "2026-03-23T00:01:00.000Z");

  assert.equal(session.startedSeriesCount, 1);
  assert.equal(session.completedSeriesCount, 0);
  assert.equal(session.series[0]?.status, "in_progress");
  assert.equal(session.totals.downloadedChapters, 1);
});

test("writeSessionSummary persists the session file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascans-session-"));
  const summaryPath = path.join(tempDir, "download-session.json");
  const session = createSessionSummary({
    mode: "download",
    outputDir: tempDir,
    concurrency: 2,
    dryRun: false,
    overwrite: false,
    writeCbz: true,
    requestedSeriesCount: 1,
    startedAt: "2026-03-23T00:00:00.000Z",
  });

  await writeSessionSummary(summaryPath, session);
  const raw = await readFile(summaryPath, "utf8");

  assert.match(raw, /"sessionId": "20260323-000000000Z"/);
  assert.match(raw, /"mode": "download"/);
});

test("recordFailedSessionSeries keeps a failed series in the session summary", () => {
  const session = createSessionSummary({
    mode: "catalog-download",
    outputDir: "downloads",
    concurrency: 4,
    dryRun: false,
    overwrite: false,
    writeCbz: true,
    requestedSeriesCount: 3,
    startedAt: "2026-03-23T00:00:00.000Z",
  });

  recordFailedSessionSeries(session, series, "Request failed: 404 Not Found", "2026-03-23T00:02:00.000Z");

  assert.equal(session.startedSeriesCount, 1);
  assert.equal(session.completedSeriesCount, 1);
  assert.equal(session.series[0]?.status, "failed");
  assert.equal(session.series[0]?.note, "Request failed: 404 Not Found");
});

test("writeSessionSummary replaces an existing file atomically", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascans-session-"));
  const summaryPath = path.join(tempDir, "download-session.json");
  const session = createSessionSummary({
    mode: "download",
    outputDir: tempDir,
    concurrency: 2,
    dryRun: false,
    overwrite: false,
    writeCbz: false,
    requestedSeriesCount: 1,
    startedAt: "2026-03-23T00:00:00.000Z",
  });

  await writeFile(summaryPath, "{ broken", "utf8");
  await writeSessionSummary(summaryPath, session);
  const raw = await readFile(summaryPath, "utf8");

  assert.doesNotThrow(() => JSON.parse(raw));
});
