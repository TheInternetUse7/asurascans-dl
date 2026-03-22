import { createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import yazl from "yazl";

const PAGE_FILE_PATTERN = /^\d+\.(?:webp|png|jpe?g|gif)$/i;

export async function createChapterCbz(chapterDir: string, outputPath?: string): Promise<string> {
  const targetPath = outputPath ?? `${chapterDir}.cbz`;
  const entries = await readdir(chapterDir, { withFileTypes: true });
  const pageFiles = entries
    .filter((entry) => entry.isFile() && PAGE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  if (pageFiles.length === 0) {
    throw new Error(`No page files found to archive in ${chapterDir}`);
  }

  await new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = createWriteStream(targetPath);

    output.on("close", () => resolve());
    output.on("error", reject);
    zip.outputStream.on("error", reject);

    // Keep the archive reader-friendly by including only ordered page assets.
    for (const fileName of pageFiles) {
      zip.addFile(path.join(chapterDir, fileName), fileName);
    }

    zip.end();
    zip.outputStream.pipe(output);
  });

  return targetPath;
}
