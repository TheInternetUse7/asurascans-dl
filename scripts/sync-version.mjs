import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function main() {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const versionFilePath = path.join(repoRoot, "src", "version.ts");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const source = `export const CLI_NAME = "asurascans-dl";
export const CLI_VERSION = ${JSON.stringify(packageJson.version)};
`;

  await writeFile(versionFilePath, source, "utf8");
}

await main();
