import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "src");
const stagingRoot = path.join(repoRoot, "dist", "bun-release-src");
const stagingSourceDir = path.join(stagingRoot, "src");
const releaseDir = path.join(repoRoot, "dist", "releases");

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function createPackageRequire(baseDir = repoRoot) {
  return createRequire(path.join(baseDir, "index.js"));
}

function resolveFromPackageRequire(packageRequire, specifier) {
  try {
    return packageRequire.resolve(specifier);
  } catch {
    return undefined;
  }
}

function resolvePackageJson(packageName, fromDir = repoRoot) {
  const packageRequire = createPackageRequire(fromDir);
  const resolvedPath =
    resolveFromPackageRequire(packageRequire, `${packageName}/package.json`)
    ?? resolveFromPackageRequire(packageRequire, `${packageName}/package`)
    ?? resolveFromPackageRequire(packageRequire, packageName);

  if (!resolvedPath) {
    throw new Error(`Could not resolve ${packageName} from ${fromDir}.`);
  }

  if (path.basename(resolvedPath) === "package.json") {
    return resolvedPath;
  }

  let currentDir = path.dirname(resolvedPath);
  while (true) {
    const candidate = path.join(currentDir, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  throw new Error(`Could not locate package.json for ${packageName} from ${resolvedPath}.`);
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
  const packageFiles = await listFilesRecursively(packageDir);

  for (const filePath of packageFiles) {
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

function getCurrentTarget() {
  const arch = process.arch === "x64" ? "x64" : process.arch;

  switch (process.platform) {
    case "win32":
      return `bun-windows-${arch}`;
    case "linux":
      return `bun-linux-${arch}`;
    default:
      throw new Error(`Unsupported release platform: ${process.platform}-${process.arch}`);
  }
}

function getArtifactName(target) {
  const suffix = target.replace(/^bun-/, "");
  return suffix.startsWith("windows-") ? `asurascans-dl-${suffix}.exe` : `asurascans-dl-${suffix}`;
}

function assertBunInstalled() {
  const result = spawnSync("bun", ["--version"], {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error("Bun is required for release builds. Install Bun 1.3+ and retry.");
  }
}

async function writeEmbeddedSharpModule(outputPath, packageFiles) {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const files = [...packageFiles].sort((left, right) => left.localeCompare(right));
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        version: packageJson.version,
        platform: process.platform,
        arch: process.arch,
        files: files.map((filePath) => toPosixPath(path.relative(repoRoot, filePath))),
      }),
    )
    .digest("hex")
    .slice(0, 16);

  const importLines = [];
  const manifestLines = [];

  files.forEach((filePath, index) => {
    const importName = `file${index}`;
    let specifier = path.relative(path.dirname(outputPath), filePath);
    if (!specifier.startsWith(".")) {
      specifier = `.${path.sep}${specifier}`;
    }

    importLines.push(`import ${importName} from ${JSON.stringify(toPosixPath(specifier))} with { type: "file" };`);
    manifestLines.push(
      `  { relativePath: ${JSON.stringify(toPosixPath(path.relative(repoRoot, filePath)))}, embeddedPath: ${importName} },`,
    );
  });

  const source = `${importLines.join("\n")}

export interface EmbeddedSharpFile {
  relativePath: string;
  embeddedPath: string;
}

// Release builds ship sharp as extracted runtime files because the package uses a dynamic native loader.
export const embeddedSharpCacheKey = ${JSON.stringify(cacheKey)};
export const embeddedSharpFiles: EmbeddedSharpFile[] = [
${manifestLines.join("\n")}
];
`;

  await writeFile(outputPath, source, "utf8");
}

async function stageReleaseSource(packageFiles) {
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingSourceDir, { recursive: true });
  // Build from a staged source tree so the generated sharp manifest never dirties the repo.
  await cp(sourceDir, stagingSourceDir, { recursive: true });
  await writeEmbeddedSharpModule(path.join(stagingSourceDir, "bun-embedded-sharp.ts"), packageFiles);
  return path.join(stagingSourceDir, "cli.ts");
}

function runBunBuild(entryPoint, target, artifactPath) {
  const args = [
    "build",
    entryPoint,
    "--compile",
    `--target=${target}`,
    `--outfile=${artifactPath}`,
  ];

  if (target.startsWith("bun-windows-")) {
    args.push("--windows-hide-console");
    args.push(`--windows-title=asurascans-dl`);
    args.push(`--windows-version=1.0.0.0`);
    args.push(`--windows-description=Asura Scans downloader`);
  }

  const result = spawnSync("bun", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Bun release build failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function main() {
  assertBunInstalled();

  const collectedFiles = new Set();
  await collectInstalledPackageFiles("sharp", new Set(), collectedFiles);

  if (collectedFiles.size === 0) {
    throw new Error("Could not locate the installed sharp runtime files needed for release packaging.");
  }

  const hasNativeAddon = [...collectedFiles].some((filePath) =>
    toPosixPath(path.relative(repoRoot, filePath)).startsWith("node_modules/@img/")
    && filePath.toLowerCase().endsWith(".node"),
  );

  if (!hasNativeAddon) {
    throw new Error(
      "The platform-specific sharp native addon was not installed. Reinstall dependencies with `bun install` and retry.",
    );
  }

  const entryPoint = await stageReleaseSource(collectedFiles);
  const target = getCurrentTarget();

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });

  const artifactPath = path.join(releaseDir, getArtifactName(target));
  runBunBuild(entryPoint, target, artifactPath);

  await writeFile(
    path.join(releaseDir, `${path.basename(artifactPath)}.txt`),
    `Built with Bun for ${target}\n`,
    "utf8",
  );

  console.log(`Release artifact written to ${artifactPath}`);
}

await main();
