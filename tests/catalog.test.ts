import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readCatalogFile, selectCatalogSeries, writeCatalogFile } from "../src/catalog.js";
import type { CatalogFile, SeriesRef } from "../src/types.js";

const series: SeriesRef[] = [
  {
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
    chapterCount: 10,
    type: "manhwa",
  },
  {
    input: "beta",
    apiSlug: "beta",
    publicSlug: "beta-public",
    url: "https://asurascans.com/comics/beta-public",
    title: "Beta",
    author: "",
    artist: "",
    description: "",
    cover: "",
    status: "ongoing",
    genres: [],
    chapterCount: 12,
    type: "manhwa",
  },
];

const catalog: CatalogFile = {
  version: 1,
  generatedAt: "2026-03-22T00:00:00.000Z",
  source: {
    site: "Asura Scans",
    apiBaseUrl: "https://api.asurascans.com/api",
    totalSeries: 2,
  },
  series,
};

test("selectCatalogSeries supports all, pending, and explicit slugs", () => {
  assert.equal(selectCatalogSeries(catalog, "all").length, 2);
  assert.deepEqual(
    selectCatalogSeries(catalog, "pending", new Set(["alpha"])).map((entry) => entry.apiSlug),
    ["beta"],
  );
  assert.deepEqual(
    selectCatalogSeries(catalog, "beta,alpha-public").map((entry) => entry.apiSlug),
    ["alpha", "beta"],
  );
});

test("writeCatalogFile and readCatalogFile round-trip catalog data", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascan-catalog-"));
  const outputPath = path.join(tempDir, "catalog.json");

  await writeCatalogFile(outputPath, catalog);
  const readBack = await readCatalogFile(outputPath);
  const raw = await readFile(outputPath, "utf8");

  assert.equal(readBack.series.length, 2);
  assert.equal(readBack.series[0]?.apiSlug, "alpha");
  assert.match(raw, /"totalSeries": 2/);
});
