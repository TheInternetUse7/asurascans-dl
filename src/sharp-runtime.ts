import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type sharp from "sharp";
import { embeddedSharpCacheKey, embeddedSharpFiles } from "./bun-embedded-sharp.js";

interface BunFileHandle {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface BunRuntime {
  file(path: string): BunFileHandle;
}

let sharpPromise: Promise<typeof sharp> | null = null;
const moduleRequire = createRequire(import.meta.url);

function getBunRuntime(): BunRuntime | null {
  const candidate = (globalThis as { Bun?: BunRuntime }).Bun;
  return candidate?.file ? candidate : null;
}

function getSharpCacheRoot(): string {
  return path.join(
    tmpdir(),
    "asurascan-dl",
    "sharp-runtime",
    embeddedSharpCacheKey || `${process.platform}-${process.arch}`,
  );
}

async function extractBundledSharpRuntime(): Promise<string> {
  const bunRuntime = getBunRuntime();
  if (!bunRuntime) {
    throw new Error("Bundled sharp extraction requires the Bun runtime.");
  }

  const cacheRoot = getSharpCacheRoot();

  for (const file of embeddedSharpFiles) {
    const destinationPath = path.join(cacheRoot, file.relativePath);
    if (existsSync(destinationPath)) {
      continue;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const assetBuffer = await bunRuntime.file(file.embeddedPath).arrayBuffer();
    await writeFile(destinationPath, Buffer.from(assetBuffer));
  }

  return cacheRoot;
}

function prependLibraryPaths(cacheRoot: string): void {
  const libraryDirs = new Set<string>();

  for (const file of embeddedSharpFiles) {
    if (!/\.(dll|so(?:\.\d+)?|dylib|node)$/i.test(file.relativePath)) {
      continue;
    }

    libraryDirs.add(path.join(cacheRoot, path.dirname(file.relativePath)));
  }

  if (libraryDirs.size === 0) {
    return;
  }

  const merged = [...libraryDirs, process.env.PATH].filter(Boolean).join(path.delimiter);
  process.env.PATH = merged;

  const extraLibraryPath = [...libraryDirs].join(path.delimiter);
  if (process.platform === "linux") {
    process.env.LD_LIBRARY_PATH = [extraLibraryPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  } else if (process.platform === "darwin") {
    process.env.DYLD_LIBRARY_PATH = [extraLibraryPath, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  }
}

async function loadBundledSharp(): Promise<typeof sharp> {
  const cacheRoot = await extractBundledSharpRuntime();
  // Native addons still load from the real filesystem, so the extracted directories must be visible to the loader.
  prependLibraryPaths(cacheRoot);

  const packageRoot = path.join(cacheRoot, "node_modules", "sharp", "package.json");
  const require = createRequire(packageRoot);
  return require("./lib/index.js") as typeof sharp;
}

export async function loadSharp(): Promise<typeof sharp> {
  if (!sharpPromise) {
    sharpPromise = embeddedSharpFiles.length > 0
      ? loadBundledSharp()
      : Promise.resolve(moduleRequire("sharp") as typeof sharp);
  }

  return sharpPromise;
}
