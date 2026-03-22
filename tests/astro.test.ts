import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { extractAstroPropFromHtml, unwrapAstroValue } from "../src/scraper.js";
import type { ChapterListDto, PageListDto } from "../src/types.js";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");

test("extractAstroPropFromHtml decodes chapter props", async () => {
  const html = await readFile(path.join(fixturesDir, "chapter-list.html"), "utf8");
  const chapters = extractAstroPropFromHtml<ChapterListDto>(html, "chapters");

  assert.equal(chapters.chapters.length, 2);
  assert.equal(chapters.chapters[0]?.number, 155);
  assert.equal(chapters.chapters[0]?.is_locked, true);
  assert.equal(chapters.chapters[1]?.series_slug, "series-api");
});

test("extractAstroPropFromHtml decodes page props", async () => {
  const html = await readFile(path.join(fixturesDir, "page-list.html"), "utf8");
  const pageList = extractAstroPropFromHtml<PageListDto>(html, "pages");

  assert.equal(pageList.pages.length, 2);
  assert.equal(pageList.pages[1]?.tile_cols, 2);
  assert.deepEqual(pageList.pages[1]?.tiles, [3, 0, 1, 2]);
});

test("unwrapAstroValue recursively unwraps nested arrays", () => {
  const wrapped = {
    pages: [1, [[0, { url: [0, "a"], tiles: [1, [[0, 2], [0, 0], [0, 1]]] }]]],
  };

  assert.deepEqual(unwrapAstroValue(wrapped), {
    pages: [{ url: "a", tiles: [2, 0, 1] }],
  });
});
