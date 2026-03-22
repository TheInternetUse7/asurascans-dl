import assert from "node:assert/strict";
import test from "node:test";
import { normalizeParsedArgs, parseArgs } from "../src/cli-options.js";

test("normalizeParsedArgs recovers npm-run mangled download args", () => {
  const parsed = normalizeParsedArgs(
    parseArgs(["download", "series-slug", "150-154", "downloads"]),
  );

  assert.equal(parsed.positionals[0], "series-slug");
  assert.equal(parsed.options.chapters, "150-154");
  assert.equal(parsed.options.output, "downloads");
});

test("normalizeParsedArgs reads npm_config options", () => {
  process.env.npm_config_chapters = "152,154";
  process.env.npm_config_output = "downloads";
  process.env.npm_config_dry_run = "true";

  try {
    const parsed = normalizeParsedArgs(parseArgs(["download", "series-slug"]));
    assert.equal(parsed.options.chapters, "152,154");
    assert.equal(parsed.options.output, "downloads");
    assert.equal(parsed.options["dry-run"], true);
  } finally {
    delete process.env.npm_config_chapters;
    delete process.env.npm_config_output;
    delete process.env.npm_config_dry_run;
  }
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
