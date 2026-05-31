import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInteractiveBookHtml,
  DEFAULT_AMBIENT_AUDIO_URL,
  estimateNarrationDurationMs,
  getInteractiveBookFilename,
  getNextPageAfterNarration,
  getPageNarration,
  getReplayStartPage,
} from "./book-reader";

test("getNextPageAfterNarration advances only when autoplay is enabled", () => {
  assert.equal(
    getNextPageAfterNarration({ autoPlay: false, currentPage: 0, totalPages: 3 }),
    0,
  );
  assert.equal(
    getNextPageAfterNarration({ autoPlay: true, currentPage: 0, totalPages: 3 }),
    1,
  );
});

test("getNextPageAfterNarration stays on the final page", () => {
  assert.equal(
    getNextPageAfterNarration({ autoPlay: true, currentPage: 2, totalPages: 3 }),
    2,
  );
});

test("getReplayStartPage restarts only after full-book playback finishes", () => {
  assert.equal(
    getReplayStartPage({
      currentPage: 3,
      hasFinishedBookPlayback: true,
      totalPages: 4,
    }),
    0,
  );

  assert.equal(
    getReplayStartPage({
      currentPage: 3,
      hasFinishedBookPlayback: false,
      totalPages: 4,
    }),
    3,
  );
});

test("getReplayStartPage continues from middle pages", () => {
  assert.equal(
    getReplayStartPage({
      currentPage: 1,
      hasFinishedBookPlayback: true,
      totalPages: 4,
    }),
    1,
  );
});

test("getPageNarration exposes readable fallback text without stored audio", () => {
  assert.deepEqual(getPageNarration({ text: "  月亮轻轻升起来。  ", audioUrl: null }), {
    audioUrl: null,
    text: "月亮轻轻升起来。",
  });
  assert.deepEqual(getPageNarration({ text: "晚安。", audioUrl: "  /uploads/audio.mp3  " }), {
    audioUrl: "/uploads/audio.mp3",
    text: "晚安。",
  });
});

test("estimateNarrationDurationMs gives muted fallback playback time", () => {
  assert.equal(estimateNarrationDurationMs(""), 0);
  assert.equal(estimateNarrationDurationMs("月亮轻轻慢慢升起来。"), 2340);
  assert.equal(estimateNarrationDurationMs("好"), 1600);
});

test("getInteractiveBookFilename keeps downloaded book names filesystem-safe", () => {
  assert.equal(getInteractiveBookFilename("  小熊:回家/第一章  "), "小熊-回家-第一章.html");
  assert.equal(getInteractiveBookFilename("   "), "interactive-picture-book.html");
});

test("buildInteractiveBookHtml creates a self-contained interactive reader shell", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安</title><script>alert(1)</script>",
    pages: [
      {
        text: "第一页<script>alert(2)</script>",
        imageUrl: "data:image/png;base64,page1",
        audioUrl: "data:audio/mpeg;base64,audio1",
      },
      {
        text: "第二页",
        imageUrl: "data:image/png;base64,page2",
        audioUrl: null,
      },
    ],
    ambientAudioUrl: "data:audio/wav;base64,ambient",
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /data:image\/png;base64,page1/);
  assert.match(html, /data:audio\/mpeg;base64,audio1/);
  assert.match(html, /data:audio\/wav;base64,ambient/);
  assert.match(html, /function playCurrentPage/);
  assert.match(html, /function startAmbientBed/);
  assert.match(html, /function logAmbient/);
  assert.doesNotMatch(html, /ambientOnly/);
  assert.doesNotMatch(html, /new Audio\(ambientAudioUrl\)/);
  assert.doesNotMatch(html, /ambient\.audio\.play/);
  assert.match(html, /createBufferSource\(\)/);
  assert.match(html, /decodeAudioData/);
  assert.match(html, /const AMBIENT_AUDIO_VOLUME = 0\.18/);
  assert.match(html, /audio\.muted = isMuted/);
  assert.doesNotMatch(html, /createOscillator/);
  assert.doesNotMatch(html, /createAmbientWavUrl/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<\/title><script>/);
});

test("buildInteractiveBookHtml starts ambient audio without yielding before play", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安",
    pages: [
      {
        text: "第一页",
        imageUrl: "data:image/png;base64,page1",
        audioUrl: "data:audio/mpeg;base64,audio1",
      },
    ],
  });

  assert.doesNotMatch(html, /await setAmbientMuted\(false\)/);
  assert.match(html, /setAmbientMuted\(false\);\s*try\s*{\s*await ambient\.context\.resume\(\);/);
});

test("buildInteractiveBookHtml waits for an explicit play click before starting media", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安",
    pages: [
      {
        text: "第一页",
        imageUrl: "data:image/png;base64,page1",
        audioUrl: "data:audio/mpeg;base64,audio1",
      },
    ],
  });

  assert.match(html, /<button id="playButton" class="primary" type="button">播放<\/button>/);
  assert.match(html, /let isPaused = true;/);
  assert.doesNotMatch(html, /renderPage\(\);\s*playCurrentPage\(\);/);
});

test("buildInteractiveBookHtml starts the ambient audio context before narration media", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安",
    pages: [
      {
        text: "第一页",
        imageUrl: "data:image/png;base64,page1",
        audioUrl: "data:audio/mpeg;base64,audio1",
      },
    ],
  });
  const ambientStartIndex = html.indexOf('const ambientStarted = startAmbientBed("before-audio-play");');
  const narrationStartIndex = html.indexOf("const narrationStarted = audio.play();");

  assert.notEqual(ambientStartIndex, -1);
  assert.notEqual(narrationStartIndex, -1);
  assert.ok(ambientStartIndex < narrationStartIndex);
});

test("buildInteractiveBookHtml uses a page-turn transition for page changes", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安",
    pages: [
      { text: "第一页", imageUrl: "data:image/png;base64,page1", audioUrl: null },
      { text: "第二页", imageUrl: "data:image/png;base64,page2", audioUrl: null },
    ],
  });

  assert.match(html, /book-page-turn/);
  assert.match(html, /function animatePageTurn/);
  assert.match(html, /rotateY/);
});

test("buildInteractiveBookHtml falls back to the bundled ambient audio asset", () => {
  const html = buildInteractiveBookHtml({
    title: "晚安",
    pages: [{ text: "第一页", imageUrl: "data:image/png;base64,page1", audioUrl: null }],
  });

  assert.match(html, new RegExp(DEFAULT_AMBIENT_AUDIO_URL.replace(/\//g, "\\/")));
});
