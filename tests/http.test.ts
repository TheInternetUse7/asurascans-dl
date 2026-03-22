import assert from "node:assert/strict";
import test from "node:test";
import { getRetryDelayMs, parseRetryAfterMs } from "../src/http.js";

test("parseRetryAfterMs parses delta-seconds headers", () => {
  assert.equal(parseRetryAfterMs("12"), 12_000);
});

test("parseRetryAfterMs parses HTTP date headers", () => {
  const now = Date.parse("2026-03-23T00:00:00.000Z");
  const retryAt = new Date(now + 9_000).toUTCString();
  assert.equal(parseRetryAfterMs(retryAt, now), 9_000);
});

test("getRetryDelayMs honors retry-after for 429s with a floor", () => {
  assert.equal(getRetryDelayMs(0, 429, "1", 0), 5_000);
  assert.equal(getRetryDelayMs(0, 429, "12", 0), 12_000);
});

test("getRetryDelayMs exponentially backs off rate limits when retry-after is absent", () => {
  assert.equal(getRetryDelayMs(0, 429, null, 0), 5_000);
  assert.equal(getRetryDelayMs(1, 429, null, 0), 10_000);
  assert.equal(getRetryDelayMs(2, 429, null, 0), 20_000);
});
