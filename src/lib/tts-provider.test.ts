import assert from "node:assert/strict";
import test from "node:test";

import {
  generateNarrationAudio,
  getTtsProviderConfig,
  type TtsFetch,
  type TtsProviderConfig,
} from "./tts-provider";

const doubaoConfig: TtsProviderConfig = {
  provider: "doubao",
  endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  auth: { kind: "api-key", apiKey: "tts-api-key" },
  resourceId: "seed-tts-2.0",
  speaker: "zh_female_shaoergushi_uranus_bigtts",
  audioFormat: "mp3",
  sampleRate: 24000,
  speechRate: -8,
  userId: "storybook-ai",
};

test("getTtsProviderConfig is disabled until Doubao TTS credentials are configured", () => {
  assert.equal(getTtsProviderConfig({}), null);
  assert.equal(getTtsProviderConfig({ DOUBAO_API_KEY: "ark-key" }), null);
});

test("getTtsProviderConfig reads Doubao TTS API key credentials and story-friendly defaults", () => {
  assert.deepEqual(
    getTtsProviderConfig({
      DOUBAO_TTS_API_KEY: "tts-api-key",
      DOUBAO_TTS_ENDPOINT: "https://tts.example/sse/",
      DOUBAO_TTS_RESOURCE_ID: "seed-tts-2.0",
      DOUBAO_TTS_VOICE_TYPE: "zh_female_story_bigtts",
      DOUBAO_TTS_SAMPLE_RATE: "16000",
      DOUBAO_TTS_SPEECH_RATE: "-12",
      DOUBAO_TTS_USER_ID: "user-1",
    }),
    {
      provider: "doubao",
      endpoint: "https://tts.example/sse",
      auth: { kind: "api-key", apiKey: "tts-api-key" },
      resourceId: "seed-tts-2.0",
      speaker: "zh_female_story_bigtts",
      audioFormat: "mp3",
      sampleRate: 16000,
      speechRate: -12,
      userId: "user-1",
    },
  );
});

test("getTtsProviderConfig lets a selected story voice override env defaults", () => {
  assert.deepEqual(
    getTtsProviderConfig(
      {
        DOUBAO_TTS_API_KEY: "tts-api-key",
        DOUBAO_TTS_RESOURCE_ID: "seed-tts-2.0",
        DOUBAO_TTS_VOICE_TYPE: "zh_female_env_default_bigtts",
      },
      {
        resourceId: "seed-tts-2.0",
        speaker: "zh_male_taocheng_uranus_bigtts",
      },
    )?.speaker,
    "zh_male_taocheng_uranus_bigtts",
  );
});

test("getTtsProviderConfig keeps Ark and TTS credentials separate", () => {
  assert.deepEqual(
    getTtsProviderConfig({
      DOUBAO_API_KEY: "doubao-key",
      DOUBAO_TTS_API_KEY: "tts-key",
    })?.auth,
    {
      kind: "api-key",
      apiKey: "tts-key",
    },
  );
});

test("getTtsProviderConfig supports legacy Doubao app credentials", () => {
  assert.deepEqual(getTtsProviderConfig({ DOUBAO_TTS_APP_ID: "app-id", DOUBAO_TTS_ACCESS_KEY: "access-key" })?.auth, {
    kind: "app",
    appId: "app-id",
    accessKey: "access-key",
  });

  assert.deepEqual(getTtsProviderConfig({ DOUBAO_TTS_APPID: "app-id", DOUBAO_TTS_ACCESS_TOKEN: "token" })?.auth, {
    kind: "app",
    appId: "app-id",
    accessKey: "token",
  });
});

test("generateNarrationAudio skips blank narration text", async () => {
  let called = false;
  const fetcher: TtsFetch = async () => {
    called = true;
    return new Response("");
  };

  const audio = await generateNarrationAudio({
    text: "   ",
    config: doubaoConfig,
    fetcher,
  });

  assert.equal(audio, null);
  assert.equal(called, false);
});

test("generateNarrationAudio sends Doubao SSE request and joins audio chunks", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const fetcher: TtsFetch = async (url, init) => {
    request = { url, init };
    return new Response(
      [
        `data: ${JSON.stringify({ code: 0, data: Buffer.from("mp3-").toString("base64") })}`,
        `data: ${JSON.stringify({ code: 0, data: Buffer.from("bytes").toString("base64") })}`,
        `data: ${JSON.stringify({ code: 20000000, data: null })}`,
        "",
      ].join("\n"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };

  const audio = await generateNarrationAudio({
    text: "  晚安，小月亮。  ",
    config: doubaoConfig,
    fetcher,
  });

  assert.equal(audio?.toString("utf8"), "mp3-bytes");
  assert.ok(request);
  assert.equal(request.url, "https://openspeech.bytedance.com/api/v3/tts/unidirectional");
  assert.equal((request.init.headers as Record<string, string>)["X-Api-Key"], "tts-api-key");
  assert.equal((request.init.headers as Record<string, string>)["X-Api-Resource-Id"], "seed-tts-2.0");
  assert.match((request.init.headers as Record<string, string>)["X-Api-Request-Id"], /^[0-9a-f-]{36}$/);

  const body = JSON.parse(request.init.body as string) as {
    user: { uid: string };
    req_params: {
      text: string;
      speaker: string;
      audio_params: { format: string; sample_rate: number; speech_rate: number };
    };
  };
  assert.equal(body.user.uid, "storybook-ai");
  assert.equal(body.req_params.text, "晚安，小月亮。");
  assert.equal(body.req_params.speaker, "zh_female_shaoergushi_uranus_bigtts");
  assert.deepEqual(body.req_params.audio_params, {
    format: "mp3",
    sample_rate: 24000,
    speech_rate: -8,
  });
});

test("generateNarrationAudio accepts Doubao JSON responses", async () => {
  const fetcher: TtsFetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "",
        data: Buffer.from("json-audio").toString("base64"),
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );

  const audio = await generateNarrationAudio({
    text: "第一页",
    config: doubaoConfig,
    fetcher,
  });

  assert.equal(audio?.toString("utf8"), "json-audio");
});

test("generateNarrationAudio accepts Doubao newline-delimited JSON responses", async () => {
  const fetcher: TtsFetch = async () =>
    new Response(
      [
        JSON.stringify({ code: 0, message: "", data: Buffer.from("json-").toString("base64") }),
        JSON.stringify({ code: 0, message: "", data: Buffer.from("chunks").toString("base64") }),
        "",
      ].join("\n"),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );

  const audio = await generateNarrationAudio({
    text: "第一页",
    config: doubaoConfig,
    fetcher,
  });

  assert.equal(audio?.toString("utf8"), "json-chunks");
});

test("generateNarrationAudio uses legacy Doubao auth headers", async () => {
  let headers: Record<string, string> | null = null;
  const fetcher: TtsFetch = async (_, init) => {
    headers = init.headers as Record<string, string>;
    return new Response(`data: ${JSON.stringify({ code: 0, data: Buffer.from("audio").toString("base64") })}\n`);
  };

  await generateNarrationAudio({
    text: "第一页",
    config: {
      ...doubaoConfig,
      auth: { kind: "app", appId: "app-id", accessKey: "access-key" },
    },
    fetcher,
  });

  assert.ok(headers);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["X-Api-App-Id"], "app-id");
  assert.equal(headers["X-Api-Access-Key"], "access-key");
  assert.equal(headers["X-Api-Resource-Id"], "seed-tts-2.0");
  assert.match(headers["X-Api-Request-Id"], /^[0-9a-f-]{36}$/);
});

test("generateNarrationAudio surfaces Doubao SSE errors", async () => {
  const fetcher: TtsFetch = async () =>
    new Response(`data: ${JSON.stringify({ code: 1001, message: "speaker unavailable" })}\n`);

  await assert.rejects(
    () => generateNarrationAudio({ text: "第一页", config: doubaoConfig, fetcher }),
    /speaker unavailable/,
  );
});

test("generateNarrationAudio surfaces invalid Doubao TTS credentials clearly", async () => {
  const fetcher: TtsFetch = async () => new Response("Invalid X-Api-Key", { status: 401 });

  await assert.rejects(
    () => generateNarrationAudio({ text: "第一页", config: doubaoConfig, fetcher }),
    /Doubao TTS credentials are invalid/,
  );
});

test("generateNarrationAudio surfaces ungranted Doubao TTS resources clearly", async () => {
  const fetcher: TtsFetch = async () =>
    new Response(
      `data: ${JSON.stringify({
        code: 45000030,
        message: "[resource_id=volc.seedtts.default] requested resource not granted",
      })}\n`,
    );

  await assert.rejects(
    () => generateNarrationAudio({ text: "第一页", config: doubaoConfig, fetcher }),
    /Doubao TTS resource is not granted/,
  );
});
