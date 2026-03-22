import assert from "node:assert/strict";
import test from "node:test";
import { extractPublicSlug, extractSeriesCandidate } from "../src/api.js";

test("extractSeriesCandidate accepts URLs and slugs", () => {
  assert.equal(
    extractSeriesCandidate("https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6"),
    "revenge-of-the-iron-blooded-sword-hound-7f873ca6",
  );
  assert.equal(
    extractSeriesCandidate("https://asurascans.com/series/revenge-of-the-iron-blooded-sword-hound"),
    "revenge-of-the-iron-blooded-sword-hound",
  );
  assert.equal(
    extractSeriesCandidate("/manga/123-revenge-of-the-iron-blooded-sword-hound/"),
    "revenge-of-the-iron-blooded-sword-hound",
  );
  assert.equal(
    extractSeriesCandidate("revenge-of-the-iron-blooded-sword-hound"),
    "revenge-of-the-iron-blooded-sword-hound",
  );
});

test("extractPublicSlug returns the public slug from a public URL", () => {
  assert.equal(
    extractPublicSlug("/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6"),
    "revenge-of-the-iron-blooded-sword-hound-7f873ca6",
  );
});
