import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AMBIENT_AUDIO_TRACKS,
  getSupportedAmbientAudioUrl,
  inferAmbientAudioMood,
  pickAmbientAudioUrl,
} from "./ambient-audio";

test("inferAmbientAudioMood defaults ordinary warm stories to positive", () => {
  assert.equal(
    inferAmbientAudioMood({
      description: "一个关于孩子和妈妈一起做蛋糕的温暖故事",
      pages: [{ text: "厨房里飘着香香的味道。" }],
      title: "甜甜的小蛋糕",
    }),
    "pos",
  );
});

test("inferAmbientAudioMood uses negative music for stories with sadness or fear", () => {
  assert.equal(
    inferAmbientAudioMood({
      description: "小兔子迷路了，夜里有点害怕，后来找到回家的路。",
      pages: [{ text: "小兔子坐在树下，眼泪轻轻掉下来。" }],
      title: "迷路的小兔子",
    }),
    "neg",
  );
});

test("pickAmbientAudioUrl chooses only from the requested polarity pool", () => {
  assert.equal(
    pickAmbientAudioUrl("pos", () => 0),
    AMBIENT_AUDIO_TRACKS.pos[0],
  );
  assert.equal(
    pickAmbientAudioUrl("neg", (max) => max - 1),
    AMBIENT_AUDIO_TRACKS.neg.at(-1),
  );
});

test("supported ambient audio urls are restricted to the final candidate pool", () => {
  assert.equal(
    getSupportedAmbientAudioUrl("/ambient/candidates_final/neg/1_neg.mp3"),
    "/ambient/candidates_final/neg/1_neg.mp3",
  );
  assert.equal(
    getSupportedAmbientAudioUrl("/ambient/candidates/01-calm-loop-relaxing.mp3"),
    AMBIENT_AUDIO_TRACKS.pos[0],
  );
});

test("ambient audio track manifest points to bundled public files", async () => {
  for (const url of [...AMBIENT_AUDIO_TRACKS.pos, ...AMBIENT_AUDIO_TRACKS.neg]) {
    assert.match(url, /^\/ambient\/candidates_final\/(pos|neg)\/.+\.mp3$/);
    await access(path.join(process.cwd(), "public", url.slice(1)));
  }
});
