import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDoubaoDoctorConfig,
  formatDoubaoDoctorError,
  shouldRunImageProbe,
  shouldRunTtsProbe,
} from "../scripts/check-doubao";

test("buildDoubaoDoctorConfig resolves story and image model settings", () => {
  const config = buildDoubaoDoctorConfig({
    DOUBAO_API_KEY: "ark-key",
    DOUBAO_BASE_URL: "https://ark.example/api/v3/",
    DOUBAO_STORY_MODEL: "ep-story",
    DOUBAO_IMAGE_MODEL: "seedream-5-image",
    DOUBAO_IMAGE_SIZE: "1536x1536",
  });

  assert.equal(config.ok, true);
  assert.equal(config.story?.model, "ep-story");
  assert.equal(config.story?.baseURL, "https://ark.example/api/v3");
  assert.equal(config.image?.model, "seedream-5-image");
  assert.equal(config.imageSize, "2K");
  assert.equal(config.tts, null);
});

test("buildDoubaoDoctorConfig resolves optional TTS settings when provided", () => {
  const config = buildDoubaoDoctorConfig({
    DOUBAO_API_KEY: "ark-key",
    DOUBAO_STORY_MODEL: "ep-story",
    DOUBAO_IMAGE_MODEL: "seedream-5-image",
    DOUBAO_TTS_API_KEY: "tts-key",
    DOUBAO_TTS_RESOURCE_ID: "seed-tts-2.0",
    DOUBAO_TTS_VOICE_TYPE: "zh_female_story_bigtts",
  });

  assert.equal(config.ok, true);
  assert.equal(config.tts?.auth.kind, "api-key");
  assert.equal(config.tts?.resourceId, "seed-tts-2.0");
  assert.equal(config.tts?.speaker, "zh_female_story_bigtts");
});

test("buildDoubaoDoctorConfig reports missing required Doubao values", () => {
  const config = buildDoubaoDoctorConfig({
    DOUBAO_API_KEY: "",
    DOUBAO_STORY_MODEL: "ep-story",
    DOUBAO_IMAGE_MODEL: "",
  });

  assert.equal(config.ok, false);
  assert.deepEqual(config.issues, [
    "DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。",
    "DOUBAO_IMAGE_MODEL 缺失：请填写方舟图片生成模型或推理接入点 ID。",
  ]);
});

test("doctor image probe only runs when explicitly requested", () => {
  assert.equal(shouldRunImageProbe([]), false);
  assert.equal(shouldRunImageProbe(["--check-image"]), true);
});

test("doctor TTS probe only runs when explicitly requested", () => {
  assert.equal(shouldRunTtsProbe([]), false);
  assert.equal(shouldRunTtsProbe(["--check-tts"]), true);
});

test("formatDoubaoDoctorError maps common provider failures to actionable Chinese guidance", () => {
  assert.match(
    formatDoubaoDoctorError({ status: 401, error: { message: "incorrect api key" } }),
    /DOUBAO_API_KEY/,
  );
  assert.match(formatDoubaoDoctorError(new Error("quota exceeded")), /额度|计费/);
  assert.match(formatDoubaoDoctorError({ status: 429, error: { message: "rate limit" } }), /请求过于频繁/);
  assert.match(formatDoubaoDoctorError(new Error("Doubao TTS credentials are invalid")), /TTS 凭证无效/);
  assert.match(formatDoubaoDoctorError(new Error("Doubao TTS resource is not granted")), /TTS 资源未开通/);
});

test("check-doubao script documents explicit image and TTS probes", async () => {
  const source = await readFile("scripts/check-doubao.ts", "utf8");

  assert.match(source, /max_tokens:\s*8/);
  assert.match(source, /--check-image/);
  assert.match(source, /--check-tts/);
  assert.match(source, /默认不会发起图片生成请求/);
  assert.match(source, /默认不会发起 TTS 请求/);
});
