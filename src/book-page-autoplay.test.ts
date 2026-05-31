import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("book page waits for an explicit play click before starting narration", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /initialAutoPlayStartedRef/);
  assert.doesNotMatch(source, /if \(!page \|\| !canPlayNarration \|\| initialAutoPlayStartedRef\.current\) return;/);
});

test("book page uses Web Audio for the ambient bed instead of a second media element", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /new Audio\(ambientAudioUrl\)/);
  assert.doesNotMatch(source, /ambient\.audio\.play\(\)/);
  assert.match(source, /createBufferSource\(\)/);
  assert.match(source, /decodeAudioData/);
});

test("book page starts the ambient audio context before playing narration media", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");
  const ambientStartIndex = source.indexOf("const ambientStarted = startAmbientBed(");
  const narrationStartIndex = source.indexOf("const narrationStarted = audio.play();");

  assert.notEqual(ambientStartIndex, -1);
  assert.notEqual(narrationStartIndex, -1);
  assert.ok(ambientStartIndex < narrationStartIndex);
});

test("book page keeps ambient audio running across page turns when playback continues", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /pauseAmbient\?: boolean/);
  assert.match(source, /stopNarration\(\{ pauseAmbient: false \}\)/);
  assert.match(source, /playNarration\(\{ preserveAmbient: true \}\)/);
});

test("book page restarts from page one after full-book playback finishes", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /getReplayStartPage/);
  assert.match(
    source,
    /const \[hasFinishedBookPlayback, setHasFinishedBookPlayback\] = useState\(false\);/,
  );
  assert.match(
    source,
    /setHasFinishedBookPlayback\(nextPage === currentPage && currentPage === totalPages - 1\);/,
  );
  assert.match(
    source,
    /const replayStartPage = getReplayStartPage\(\{\s*currentPage,\s*hasFinishedBookPlayback,\s*totalPages,\s*}\);/,
  );
  assert.match(source, /goTo\(replayStartPage, \{ autoPlay: true }\);/);
});

test("book page offers a clear action to create another book", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /router\.push\("\/create"\)/);
  assert.match(source, /创作新绘本/);
});

test("book page keeps download actions visually consistent", async () => {
  const source = await readFile(new URL("./app/book/[id]/page.tsx", import.meta.url), "utf8");
  const downloadButtonBlock = source.match(
    /onClick=\{downloadInteractiveBook\}[\s\S]*?\{isDownloading \? "下载中" : "下载网页绘本"}[\s\S]*?<\/button>/,
  )?.[0];

  assert.ok(downloadButtonBlock);
  assert.match(downloadButtonBlock, /bg-white/);
  assert.match(downloadButtonBlock, /text-amber-800/);
  assert.match(downloadButtonBlock, /ring-1 ring-amber-200/);
  assert.doesNotMatch(downloadButtonBlock, /bg-amber-700/);
  assert.doesNotMatch(downloadButtonBlock, /text-white/);
});
