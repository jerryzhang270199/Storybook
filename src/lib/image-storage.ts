import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export function getUploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

function getContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function assertSafeFilename(filename: string) {
  if (filename !== path.basename(filename) || filename.includes("..")) {
    throw new Error("Invalid filename");
  }
}

export async function saveImage(
  base64Data: string,
  filename: string,
  uploadsDir: string = getUploadsDir(),
): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  return saveFile(buffer, filename, getContentType(filename), uploadsDir);
}

export async function saveFile(
  buffer: Buffer,
  filename: string,
  _contentType: string,
  uploadsDir: string = getUploadsDir(),
): Promise<string> {
  assertSafeFilename(filename);

  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return `/uploads/${filename}`;
}

export async function loadImageBuffer(
  imageUrl: string,
  uploadsDir: string = getUploadsDir(),
): Promise<Buffer> {
  if (imageUrl.startsWith("/uploads/")) {
    const filename = imageUrl.slice("/uploads/".length);
    assertSafeFilename(filename);
    return fs.readFile(path.join(uploadsDir, filename));
  }

  const url = new URL(imageUrl);
  if (url.protocol !== "https:") {
    throw new Error("Unsupported image URL");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load stored image");
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function deleteSavedImages(
  imageUrls: Array<string | null | undefined>,
  uploadsDir: string = getUploadsDir(),
): Promise<void> {
  await Promise.all(
    imageUrls.map(async (imageUrl) => {
      if (!imageUrl) return;

      if (!imageUrl.startsWith("/uploads/")) {
        return;
      }

      const filename = imageUrl.slice("/uploads/".length);
      assertSafeFilename(filename);
      await fs.rm(path.join(uploadsDir, filename), { force: true });
    }),
  );
}

export function generateFilename(prefix: string, ext: string = "png"): string {
  return `${prefix}-${randomUUID()}.${ext}`;
}
