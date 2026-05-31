import sharp from "sharp";
import type { SupportedImageMimeType } from "./uploads";

export type ImageReference = {
  buffer: Buffer;
  filename: string;
  mediaType: SupportedImageMimeType;
};

export type PngImageReference = {
  buffer: Buffer;
  filename: string;
  mediaType: "image/png";
};

const CANVAS_SIZE = 1024;
const PADDING = 32;
const BACKGROUND = { r: 255, g: 251, b: 235, alpha: 1 };

function getGridSize(count: number) {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  return { columns: 2, rows: 2 };
}

export async function createReferenceCollage(
  images: ImageReference[],
): Promise<PngImageReference> {
  if (images.length === 0) {
    throw new Error("At least one reference image is required to create a collage.");
  }

  const { columns, rows } = getGridSize(images.length);
  const tileSize = Math.floor(
    Math.min(
      (CANVAS_SIZE - PADDING * (columns + 1)) / columns,
      (CANVAS_SIZE - PADDING * (rows + 1)) / rows,
    ),
  );

  const composites = await Promise.all(
    images.map(async (image, index) => {
      const resized = await sharp(image.buffer)
        .rotate()
        .resize(tileSize, tileSize, {
          fit: "inside",
          withoutEnlargement: true,
          background: BACKGROUND,
        })
        .flatten({ background: BACKGROUND })
        .png()
        .toBuffer();
      const metadata = await sharp(resized).metadata();
      const column = index % columns;
      const row = Math.floor(index / columns);
      const tileLeft = PADDING + column * (tileSize + PADDING);
      const tileTop = PADDING + row * (tileSize + PADDING);

      return {
        input: resized,
        left: tileLeft + Math.floor((tileSize - (metadata.width ?? tileSize)) / 2),
        top: tileTop + Math.floor((tileSize - (metadata.height ?? tileSize)) / 2),
      };
    }),
  );

  const buffer = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    buffer,
    filename: "reference-collage.png",
    mediaType: "image/png",
  };
}
