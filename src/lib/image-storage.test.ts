import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  deleteSavedImages,
  loadImageBuffer,
  saveFile,
  saveImage,
} from "./image-storage";

test("image storage module stays local-only for the open-source template", async () => {
  const source = await readFile("src/lib/image-storage.ts", "utf8");

  assert.doesNotMatch(source, /@vercel\/blob/);
  assert.doesNotMatch(source, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(source, /getImageStorageMode/);
});

test("saveImage writes base64 data under uploads and deleteSavedImages removes it", async () => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), "storybook-uploads-"));
  const imageUrl = await saveImage(
    Buffer.from("image-bytes").toString("base64"),
    "page-test.png",
    uploadsDir,
  );

  assert.equal(imageUrl, "/uploads/page-test.png");
  assert.equal(await readFile(path.join(uploadsDir, "page-test.png"), "utf8"), "image-bytes");
  assert.equal((await loadImageBuffer(imageUrl, uploadsDir)).toString("utf8"), "image-bytes");

  await deleteSavedImages([imageUrl], uploadsDir);

  await assert.rejects(stat(path.join(uploadsDir, "page-test.png")));
  await rm(uploadsDir, { recursive: true, force: true });
});

test("saveFile writes binary media under uploads and deleteSavedImages removes it", async () => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), "storybook-uploads-"));
  const audioUrl = await saveFile(Buffer.from("audio-bytes"), "audio-test.mp3", "audio/mpeg", uploadsDir);

  assert.equal(audioUrl, "/uploads/audio-test.mp3");
  assert.equal(await readFile(path.join(uploadsDir, "audio-test.mp3"), "utf8"), "audio-bytes");

  await deleteSavedImages([audioUrl], uploadsDir);

  await assert.rejects(stat(path.join(uploadsDir, "audio-test.mp3")));
  await rm(uploadsDir, { recursive: true, force: true });
});

test("saveImage rejects filenames that try to escape the uploads directory", async () => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), "storybook-uploads-"));

  await assert.rejects(
    saveImage(Buffer.from("bad").toString("base64"), "../bad.png", uploadsDir),
    /Invalid filename/,
  );

  await rm(uploadsDir, { recursive: true, force: true });
});
