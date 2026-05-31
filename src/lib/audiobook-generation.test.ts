import assert from "node:assert/strict";
import test from "node:test";

import { generatePageAudioUrls } from "./audiobook-generation";
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

test("generatePageAudioUrls returns null urls when TTS is not configured", async () => {
  let called = false;
  const audioUrls = await generatePageAudioUrls({
    pages: [{ text: "第一页" }, { text: "第二页" }],
    config: null,
    async generateAudio() {
      called = true;
      return Buffer.from("audio");
    },
    async saveAudio() {
      return "/uploads/audio.mp3";
    },
  });

  assert.deepEqual(audioUrls, [null, null]);
  assert.equal(called, false);
});

test("generatePageAudioUrls saves generated narration audio per page", async () => {
  const generatedTexts: string[] = [];
  const savedAudio: string[] = [];

  const audioUrls = await generatePageAudioUrls({
    pages: [{ text: "第一页" }, { text: "  " }, { text: "第三页" }],
    config,
    async generateAudio({ text }) {
      generatedTexts.push(text);
      return text.trim() ? Buffer.from(`audio:${text.trim()}`) : null;
    },
    async saveAudio(buffer, index) {
      savedAudio.push(buffer.toString("utf8"));
      return `/uploads/audio-${index + 1}.mp3`;
    },
  });

  assert.deepEqual(generatedTexts, ["第一页", "  ", "第三页"]);
  assert.deepEqual(savedAudio, ["audio:第一页", "audio:第三页"]);
  assert.deepEqual(audioUrls, ["/uploads/audio-1.mp3", null, "/uploads/audio-3.mp3"]);
});

test("generatePageAudioUrls degrades to silent pages when TTS generation fails", async () => {
  const audioUrls = await generatePageAudioUrls({
    pages: [{ text: "第一页" }, { text: "第二页" }],
    config,
    async generateAudio() {
      throw new Error("TTS route unavailable");
    },
    async saveAudio() {
      throw new Error("should not save failed audio");
    },
  });

  assert.deepEqual(audioUrls, [null, null]);
});
