import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { deobfuscateImage } from "../src/deobfuscate.js";

async function createQuadrantImage(colors: Array<{ r: number; g: number; b: number; alpha: number }>): Promise<Buffer> {
  const width = 20;
  const height = 20;
  const tileSize = 10;
  const overlays = colors.map((color, index) => {
    const left = (index % 2) * tileSize;
    const top = Math.floor(index / 2) * tileSize;

    return {
      input: {
        create: {
          width: tileSize,
          height: tileSize,
          channels: 4,
          background: color,
        },
      },
      left,
      top,
    };
  });

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}

async function samplePixel(buffer: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(index, index + Math.min(info.channels, 3)));
}

test("deobfuscateImage mirrors the Mihon tile mapping", async () => {
  const scrambled = await createQuadrantImage([
    { r: 255, g: 0, b: 0, alpha: 255 },
    { r: 0, g: 255, b: 0, alpha: 255 },
    { r: 0, g: 0, b: 255, alpha: 255 },
    { r: 255, g: 255, b: 0, alpha: 255 },
  ]);

  const restored = await deobfuscateImage(scrambled, [3, 0, 1, 2], 2, 2);

  assert.deepEqual(await samplePixel(restored, 5, 5), [0, 255, 0]);
  assert.deepEqual(await samplePixel(restored, 15, 5), [0, 0, 255]);
  assert.deepEqual(await samplePixel(restored, 5, 15), [255, 255, 0]);
  assert.deepEqual(await samplePixel(restored, 15, 15), [255, 0, 0]);
});
