import assert from "node:assert/strict";
import test from "node:test";
import { selectChapters } from "../src/selection.js";
import type { SChapter } from "../src/types.js";

const chapters: SChapter[] = [
  {
    number: 150,
    numberText: "150",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "series-api",
    url: "/series/series-api/chapter/150",
  },
  {
    number: 151,
    numberText: "151",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "series-api",
    url: "/series/series-api/chapter/151",
  },
  {
    number: 152.5,
    numberText: "152.5",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "series-api",
    url: "/series/series-api/chapter/152.5",
  },
  {
    number: 154,
    numberText: "154",
    title: "",
    createdAt: "",
    isLocked: true,
    seriesSlug: "series-api",
    url: "/series/series-api/chapter/154",
  },
  {
    number: 153,
    numberText: "153",
    title: "",
    createdAt: "",
    isLocked: false,
    seriesSlug: "series-api",
    url: "/series/series-api/chapter/153",
  },
];

test("selectChapters handles all and latest selectors", () => {
  assert.deepEqual(
    selectChapters(chapters, "all").map((chapter) => chapter.numberText),
    ["150", "151", "152.5", "153", "154"],
  );
  assert.deepEqual(selectChapters(chapters, "latest").map((chapter) => chapter.numberText), ["154"]);
  assert.deepEqual(selectChapters(chapters, "latest-public").map((chapter) => chapter.numberText), ["153"]);
});

test("selectChapters handles ranges and mixed selectors", () => {
  assert.deepEqual(
    selectChapters(chapters, "150-151,154").map((chapter) => chapter.numberText),
    ["150", "151", "154"],
  );
  assert.deepEqual(
    selectChapters(chapters, "152.5,154").map((chapter) => chapter.numberText),
    ["152.5", "154"],
  );
});

test("selectChapters rejects invalid tokens", () => {
  assert.throws(() => selectChapters(chapters, "latest,foo"), /Invalid chapter selector token/);
  assert.throws(() => selectChapters(chapters, "999"), /Chapter 999 was not found/);
});
