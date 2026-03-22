import sharp from "sharp";
import { asuraFetch } from "./http.js";

export async function deobfuscateImage(
  imageBuffer: Buffer,
  tiles: number[],
  tileCols: number,
  tileRows: number,
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions.");
  }

  const tileWidth = Math.floor(metadata.width / tileCols);
  const tileHeight = Math.floor(metadata.height / tileRows);
  const composites: sharp.OverlayOptions[] = [];

  for (let sourceIndex = 0; sourceIndex < tiles.length; sourceIndex += 1) {
    const destinationIndex = tiles[sourceIndex];
    const sourceColumn = sourceIndex % tileCols;
    const sourceRow = Math.floor(sourceIndex / tileCols);
    const destinationColumn = destinationIndex % tileCols;
    const destinationRow = Math.floor(destinationIndex / tileCols);

    // The Asura payload maps each source tile to its destination position; Mihon uses the same direction.
    const tileBuffer = await sharp(imageBuffer)
      .extract({
        left: sourceColumn * tileWidth,
        top: sourceRow * tileHeight,
        width: tileWidth,
        height: tileHeight,
      })
      .toBuffer();

    composites.push({
      input: tileBuffer,
      left: destinationColumn * tileWidth,
      top: destinationRow * tileHeight,
    });
  }

  return sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ lossless: true, quality: 100 })
    .toBuffer();
}

export async function downloadAndDeobfuscate(
  url: string,
  tiles: number[],
  tileCols: number,
  tileRows: number,
): Promise<Buffer> {
  const response = await asuraFetch(url, {}, { includeOrigin: false });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (tiles.length === 0) {
    return buffer;
  }

  return deobfuscateImage(buffer, tiles, tileCols, tileRows);
}
