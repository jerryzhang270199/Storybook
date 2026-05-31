import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureBookPageAudioUrl,
  type BookPageAudioStore,
} from "./book-page-audio";
import type { TtsProviderConfig } from "./tts-provider";

const config: TtsProviderConfig = {
  provider: "doubao",
  endpoint: "https://tts.example/sse",
  auth: { kind: "api-key", apiKey: "tts-key" },
  resourceId: "seed-tts-2.0",
  speaker: "zh_female_shaoergushi_uranus_bigtts",
  audioFormat: "mp3",
  sampleRate: 24000,
  speechRate: -8,
  userId: "storybook-ai",
};

function createStore(
  page: { audioUrl: string | null; id: string; text: string } | null,
): BookPageAudioStore & { updatedAudioUrl: string | null } {
  return {
    updatedAudioUrl: null,
    async findPage() {
      return page;
    },
    async updatePageAudioUrl({ audioUrl }) {
      this.updatedAudioUrl = audioUrl;
    },
  };
}

test("ensureBookPageAudioUrl returns existing stored audio", async () => {
  let generated = false;
  const store = createStore({ id: "page-1", text: "第一页", audioUrl: "/uploads/audio.mp3" });

  const audioUrl = await ensureBookPageAudioUrl({
    bookId: "book-1",
    pageId: "page-1",
    config,
    store,
    async generateAudio() {
      generated = true;
      return Buffer.from("audio");
    },
    async saveAudio() {
      return "/uploads/new.mp3";
    },
  });

  assert.equal(audioUrl, "/uploads/audio.mp3");
  assert.equal(generated, false);
  assert.equal(store.updatedAudioUrl, null);
});

test("ensureBookPageAudioUrl generates and stores missing page audio", async () => {
  const store = createStore({ id: "page-1", text: "第一页", audioUrl: null });
  const audioUrl = await ensureBookPageAudioUrl({
    bookId: "book-1",
    pageId: "page-1",
    config,
    store,
    async generateAudio({ text }) {
      assert.equal(text, "第一页");
      return Buffer.from("doubao-audio");
    },
    async saveAudio(buffer) {
      assert.equal(buffer.toString("utf8"), "doubao-audio");
      return "/uploads/generated.mp3";
    },
  });

  assert.equal(audioUrl, "/uploads/generated.mp3");
  assert.equal(store.updatedAudioUrl, "/uploads/generated.mp3");
});

test("ensureBookPageAudioUrl lets the store enforce ownership without a user id", async () => {
  let findPageInput: unknown = null;

  await ensureBookPageAudioUrl({
    bookId: "book-1",
    pageId: "page-1",
    config,
    store: {
      findPage(input) {
        findPageInput = input;
        return Promise.resolve({ id: "page-1", text: "第一页", audioUrl: "/uploads/audio.mp3" });
      },
      async updatePageAudioUrl() {},
    },
  });

  assert.deepEqual(findPageInput, { bookId: "book-1", pageId: "page-1" });
});

test("ensureBookPageAudioUrl refuses to use browser fallback when TTS is not configured", async () => {
  const store = createStore({ id: "page-1", text: "第一页", audioUrl: null });

  await assert.rejects(
    () =>
      ensureBookPageAudioUrl({
        bookId: "book-1",
        pageId: "page-1",
        config: null,
        store,
      }),
    /Doubao TTS is not configured/,
  );
});

test("ensureBookPageAudioUrl rejects pages outside the current book owner", async () => {
  await assert.rejects(
    () =>
      ensureBookPageAudioUrl({
        bookId: "book-1",
        pageId: "page-1",
        config,
        store: createStore(null),
      }),
    /Book page not found/,
  );
});
