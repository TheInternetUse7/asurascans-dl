import assert from "node:assert/strict";
import test from "node:test";
import { normalizeParsedArgs, parseArgs } from "../src/cli-options.js";

test("normalizeParsedArgs recovers positional download fallbacks", () => {
  const parsed = normalizeParsedArgs(
    parseArgs(["download", "series-slug", "150-154", "downloads"]),
  );

  assert.equal(parsed.positionals[0], "series-slug");
  assert.equal(parsed.options.chapters, "150-154");
  assert.equal(parsed.options.output, "downloads");
});

test("normalizeParsedArgs recovers catalog download positional fallbacks", () => {
  const parsed = normalizeParsedArgs(
    parseArgs(["catalog", "download", "catalog.json", "pending", "downloads", "6"]),
  );

  assert.deepEqual(parsed.positionals, ["download", "catalog.json"]);
  assert.equal(parsed.options.series, "pending");
  assert.equal(parsed.options.output, "downloads");
  assert.equal(parsed.options.concurrency, "6");
});
