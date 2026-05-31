import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createReferenceCollage } from "./reference-collage";

async function makePng(color: string) {
  return sharp({
    create: {
      width: 64,
      height: 48,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

test("createReferenceCollage combines multiple images into a single png reference", async () => {
  const collage = await createReferenceCollage([
    {
      buffer: await makePng("#ff0000"),
      filename: "red.png",
      mediaType: "image/png",
    },
    {
      buffer: await makePng("#00ff00"),
      filename: "green.png",
      mediaType: "image/png",
    },
  ]);

  const metadata = await sharp(collage.buffer).metadata();
  assert.equal(collage.filename, "reference-collage.png");
  assert.equal(collage.mediaType, "image/png");
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
});
