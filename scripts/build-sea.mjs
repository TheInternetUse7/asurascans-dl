import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const seaDir = path.join(repoRoot, "dist", "sea");
const releaseDir = path.join(repoRoot, "dist", "releases");

function assertBuildSeaSupport() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 25) {
    throw new Error("SEA release builds require Node.js 25+ because this project uses `node --build-sea`.");
  }
}

function getArtifactName() {
  const suffix = `${process.platform}-${process.arch}`;
  return process.platform === "win32" ? `asurascan-dl-${suffix}.exe` : `asurascan-dl-${suffix}`;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function listFilesRecursively(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function resolvePackageJson(packageName, fromDir = repoRoot) {
  const localRequire = createRequire(path.join(fromDir, "index.js"));
  return localRequire.resolve(`${packageName}/package.json`);
}

async function collectInstalledPackageFiles(packageName, collectedPackages, collectedFiles, fromDir = repoRoot) {
  let packageJsonPath;

  try {
    packageJsonPath = resolvePackageJson(packageName, fromDir);
  } catch {
    return;
  }

  const packageDir = path.dirname(packageJsonPath);
  if (collectedPackages.has(packageDir)) {
    return;
  }

  collectedPackages.add(packageDir);

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const files = await listFilesRecursively(packageDir);

  for (const filePath of files) {
    collectedFiles.add(filePath);
  }

  const runtimeDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
  };

  for (const dependencyName of Object.keys(runtimeDependencies)) {
    await collectInstalledPackageFiles(dependencyName, collectedPackages, collectedFiles, packageDir);
  }
}

async function buildCliBundle(entryPath, outputPath) {
  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: false,
    legalComments: "none",
    external: ["sharp"],
  });
}

async function buildAssetManifest(bundlePath, packageFiles) {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({
      version: packageJson.version,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
    }))
    .digest("hex")
    .slice(0, 16);

  const files = [bundlePath, ...packageFiles].sort();
  const assets = [];

  for (const filePath of files) {
    const relativePath = path.relative(repoRoot, filePath);
    const assetPath = relativePath.startsWith("node_modules")
      ? relativePath
      : path.join("app", relativePath);
    const fileStat = await stat(filePath);

    assets.push({
      key: toPosixPath(assetPath),
      path: toPosixPath(assetPath),
      size: fileStat.size,
      source: filePath,
    });
  }

  return {
    cacheKey,
    entryPoint: "app/dist/sea/app.cjs",
    assets,
  };
}

async function writeSeaConfig(manifest, outputPath) {
  const assets = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.source]));
  const config = {
    main: path.join(repoRoot, "scripts", "sea-bootstrap.cjs"),
    output: outputPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: {
      "asset-manifest.json": path.join(seaDir, "asset-manifest.json"),
      ...assets,
    },
  };

  const configPath = path.join(seaDir, "sea-config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

async function main() {
  assertBuildSeaSupport();

  await rm(seaDir, { recursive: true, force: true });
  await mkdir(seaDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });

  const bundlePath = path.join(seaDir, "app.cjs");
  await buildCliBundle(path.join(repoRoot, "src", "cli.ts"), bundlePath);

  const packageFiles = new Set();
  await collectInstalledPackageFiles("sharp", new Set(), packageFiles);

  const manifest = await buildAssetManifest(bundlePath, [...packageFiles]);
  await writeFile(
    path.join(seaDir, "asset-manifest.json"),
    `${JSON.stringify({
      cacheKey: manifest.cacheKey,
      entryPoint: manifest.entryPoint,
      assets: manifest.assets.map(({ key, path: assetPath, size }) => ({ key, path: assetPath, size })),
    }, null, 2)}\n`,
    "utf8",
  );

  const artifactPath = path.join(releaseDir, getArtifactName());
  const configPath = await writeSeaConfig(manifest, artifactPath);

  const result = spawnSync(process.execPath, ["--build-sea", configPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`SEA build failed with exit code ${result.status ?? "unknown"}.`);
  }

  // Include a tiny plaintext version marker alongside the artifact for release debugging.
  await writeFile(
    path.join(releaseDir, `${getArtifactName()}.txt`),
    `Built with Node ${process.versions.node} for ${process.platform}-${process.arch}\n`,
    "utf8",
  );

  console.log(`SEA artifact written to ${artifactPath}`);
}

await main();
