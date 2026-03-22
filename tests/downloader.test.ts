import assert from "node:assert/strict";
import test from "node:test";
import { getRecoveryDelayMs, isTransientDownloadErrorMessage } from "../src/downloader.js";

test("isTransientDownloadErrorMessage recognizes rate limits and upstream failures", () => {
  assert.equal(isTransientDownloadErrorMessage("HTTP 429 Too Many Requests"), true);
  assert.equal(isTransientDownloadErrorMessage("HTTP 522 Connection Timed Out"), true);
  assert.equal(isTransientDownloadErrorMessage("fetch failed"), true);
  assert.equal(isTransientDownloadErrorMessage("HTTP 404 Not Found"), false);
});

test("getRecoveryDelayMs exponentially backs off recovery passes", () => {
  assert.equal(getRecoveryDelayMs(1), 5_000);
  assert.equal(getRecoveryDelayMs(2), 10_000);
});
