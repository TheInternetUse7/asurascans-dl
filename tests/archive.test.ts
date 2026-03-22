import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createChapterCbz } from "../src/archive.js";

test("createChapterCbz archives only page files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asurascan-cbz-"));
  const chapterDir = path.join(tempDir, "Chapter 154");
  await mkdir(chapterDir, { recursive: true });

  await writeFile(path.join(chapterDir, "001.webp"), "page-1");
  await writeFile(path.join(chapterDir, "002.webp"), "page-2");
  await writeFile(path.join(chapterDir, "chapter.json"), "{}");

  const archivePath = await createChapterCbz(chapterDir);
  const archiveStat = await stat(archivePath);

  assert.ok(archivePath.endsWith(".cbz"));
  assert.ok(archiveStat.size > 0);
});
