import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("book video download route uses cached mp4 for normal downloads", async () => {
  const source = await readFile("src/app/api/books/[id]/video/route.ts", "utf8");

  assert.match(source, /getOrCreateCachedBookVideo/);
  assert.match(source, /ambientOnly \? await createBookVideo/);
});

test("book deletion removes cached mp4 files", async () => {
  const source = await readFile("src/app/api/books/[id]/route.ts", "utf8");

  assert.match(source, /deleteCachedBookVideo/);
  assert.match(source, /deletedBook\.id/);
});

test("generation runner prewarms cached mp4 after book completion", async () => {
  const source = await readFile("src/lib/generation-runner.ts", "utf8");

  assert.match(source, /shouldPrewarmBookVideoCache/);
  assert.match(source, /startBookVideoCachePrewarm/);
  const completionIndex = source.indexOf("status: GENERATION_JOB_STATUS.completed");
  const prewarmIndex = source.indexOf("void startBookVideoCachePrewarm({", completionIndex);

  assert.ok(
    completionIndex !== -1 && prewarmIndex !== -1 && completionIndex < prewarmIndex,
    "job should be marked completed before asynchronous ffmpeg cache prewarm starts",
  );
});
