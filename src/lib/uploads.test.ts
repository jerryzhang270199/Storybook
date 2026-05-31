import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_REFERENCE_IMAGES,
  MAX_TOTAL_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  validateUploadedImage,
  validateUploadedImages,
} from "./uploads";

test("validateUploadedImage accepts supported image files and normalizes jpeg extension", () => {
  const result = validateUploadedImage({
    name: "child-photo.jpeg",
    size: 1024,
    type: "image/jpeg",
  });

  assert.deepEqual(result, { ok: true, extension: "jpg" });
});

test("validateUploadedImage rejects unsupported image types", () => {
  const result = validateUploadedImage({
    name: "story.svg",
    size: 1024,
    type: "image/svg+xml",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /JPG, PNG, or WebP/);
  }
});

test("validateUploadedImage rejects oversized files", () => {
  const result = validateUploadedImage({
    name: "large.png",
    size: MAX_UPLOAD_BYTES + 1,
    type: "image/png",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /8MB/);
  }
});

test("validateUploadedImages accepts one to four supported reference images", () => {
  const result = validateUploadedImages([
    { name: "one.jpg", size: 1024, type: "image/jpeg" },
    { name: "two.png", size: 2048, type: "image/png" },
    { name: "three.webp", size: 4096, type: "image/webp" },
    { name: "four.jpg", size: 8192, type: "image/jpeg" },
  ]);

  assert.deepEqual(result, {
    ok: true,
    items: [
      { extension: "jpg" },
      { extension: "png" },
      { extension: "webp" },
      { extension: "jpg" },
    ],
  });
});

test("validateUploadedImages rejects empty and excessive image selections", () => {
  const empty = validateUploadedImages([]);
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.match(empty.error, /at least one/i);
  }

  const tooMany = validateUploadedImages(
    Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, (_, index) => ({
      name: `${index}.jpg`,
      size: 1024,
      type: "image/jpeg",
    })),
  );
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) {
    assert.match(tooMany.error, /up to 4/i);
  }
});

test("validateUploadedImages rejects total upload payloads above the multi-image limit", () => {
  const result = validateUploadedImages([
    { name: "one.jpg", size: MAX_TOTAL_UPLOAD_BYTES - 512, type: "image/jpeg" },
    { name: "two.jpg", size: 1024, type: "image/jpeg" },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /32MB/);
  }
});
