import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeFileAtomically(targetPath: string, contents: string): Promise<void> {
  const resolvedPath = path.resolve(targetPath);
  const directory = path.dirname(resolvedPath);
  const tempPath = path.join(
    directory,
    `.${path.basename(resolvedPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, contents, "utf8");

  try {
    await rename(tempPath, resolvedPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}
