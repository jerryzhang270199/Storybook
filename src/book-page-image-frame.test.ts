import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("book page shows the full generated image instead of cropping it behind the caption", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /className="relative w-full max-w-lg aspect-square"/);
  assert.match(source, /className="relative aspect-square/);
  assert.match(source, /className="object-contain"/);
  assert.doesNotMatch(source, /className="object-cover"/);
});

test("book page uses a page-turn animation instead of horizontal slide", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /transformPerspective/);
  assert.match(source, /rotateY/);
  assert.match(source, /transformOrigin/);
  assert.doesNotMatch(source, /initial=\{\{ opacity: 0, x: direction \* 100 \}\}/);
});

test("book page avoids a lingering exit layer during page turns", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /AnimatePresence/);
  assert.doesNotMatch(source, /mode="popLayout"/);
  assert.doesNotMatch(source, /exit: \(turnDirection: number\)/);
  assert.match(source, /PAGE_TURN_IMAGE_PRELOAD_SPAN/);
});
