import { randomUUID } from "node:crypto";
import { withDoubaoConnectionRetry } from "./doubao-network";

const DOUBAO_TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const DOUBAO_TTS_RESOURCE_ID = "seed-tts-2.0";
const DOUBAO_TTS_SPEAKER = "zh_female_shaoergushi_uranus_bigtts";
const DOUBAO_TTS_SAMPLE_RATE = 24000;
const DOUBAO_TTS_SPEECH_RATE = -8;
const DOUBAO_TTS_USER_ID = "storybook-ai";

export type DoubaoTtsAuth =
  | {
      kind: "api-key";
      apiKey: string;
    }
  | {
      kind: "app";
      accessKey: string;
      appId: string;
    };

export type TtsProviderConfig = {
  provider: "doubao";
  endpoint: string;
  auth: DoubaoTtsAuth;
  resourceId: string;
  speaker: string;
  audioFormat: "mp3";
  sampleRate: number;
  speechRate: number;
  userId: string;
  emotion?: string;
  emotionScale?: number;
};

export type TtsProviderEnv = Record<string, string | undefined> & {
  DOUBAO_TTS_API_KEY?: string;
  DOUBAO_TTS_APP_ID?: string;
  DOUBAO_TTS_APPID?: string;
  DOUBAO_TTS_ACCESS_KEY?: string;
  DOUBAO_TTS_ACCESS_TOKEN?: string;
  DOUBAO_TTS_TOKEN?: string;
  DOUBAO_TTS_ENDPOINT?: string;
  DOUBAO_TTS_RESOURCE_ID?: string;
  DOUBAO_TTS_VOICE_TYPE?: string;
  DOUBAO_TTS_SPEAKER?: string;
  DOUBAO_TTS_SAMPLE_RATE?: string;
  DOUBAO_TTS_SPEECH_RATE?: string;
  DOUBAO_TTS_USER_ID?: string;
  DOUBAO_TTS_EMOTION?: string;
  DOUBAO_TTS_EMOTION_SCALE?: string;
};

export type TtsProviderConfigOverrides = Partial<
  Pick<TtsProviderConfig, "resourceId" | "speaker">
>;

export type TtsFetch = (url: string, init: RequestInit) => Promise<Response>;

type DoubaoSseEvent = {
  code?: number;
  data?: string | null;
  message?: string;
};

function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "");
}

function readEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function readNumber(value: string | undefined, fallback: number): number {
  const rawValue = readEnvValue(value);
  if (!rawValue) return fallback;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDoubaoAuth(env: TtsProviderEnv): DoubaoTtsAuth | null {
  const apiKey = readEnvValue(env.DOUBAO_TTS_API_KEY);
  if (apiKey) {
    return { kind: "api-key", apiKey };
  }

  const appId = readEnvValue(env.DOUBAO_TTS_APP_ID || env.DOUBAO_TTS_APPID);
  const accessKey = readEnvValue(env.DOUBAO_TTS_ACCESS_KEY || env.DOUBAO_TTS_ACCESS_TOKEN || env.DOUBAO_TTS_TOKEN);
  if (appId && accessKey) {
    return { kind: "app", appId, accessKey };
  }

  return null;
}

function isCredentialErrorMessage(message: string): boolean {
  return /invalid\s+x-api-(key|app-id|access-key)|unauthorized|authentication|credential/i.test(message);
}

function isResourceNotGrantedMessage(message: string): boolean {
  return /resource(?:_id)?=.*not granted|requested resource not granted/i.test(message);
}

export function getTtsProviderConfig(
  env: TtsProviderEnv = process.env,
  overrides: TtsProviderConfigOverrides = {},
): TtsProviderConfig | null {
  const auth = getDoubaoAuth(env);
  if (!auth) return null;

  const emotion = readEnvValue(env.DOUBAO_TTS_EMOTION);
  const emotionScale = readNumber(env.DOUBAO_TTS_EMOTION_SCALE, Number.NaN);

  return {
    provider: "doubao",
    endpoint: normalizeEndpoint(readEnvValue(env.DOUBAO_TTS_ENDPOINT) || DOUBAO_TTS_ENDPOINT),
    auth,
    resourceId: readEnvValue(overrides.resourceId) || readEnvValue(env.DOUBAO_TTS_RESOURCE_ID) || DOUBAO_TTS_RESOURCE_ID,
    speaker: readEnvValue(overrides.speaker) || readEnvValue(env.DOUBAO_TTS_VOICE_TYPE || env.DOUBAO_TTS_SPEAKER) || DOUBAO_TTS_SPEAKER,
    audioFormat: "mp3",
    sampleRate: readNumber(env.DOUBAO_TTS_SAMPLE_RATE, DOUBAO_TTS_SAMPLE_RATE),
    speechRate: readNumber(env.DOUBAO_TTS_SPEECH_RATE, DOUBAO_TTS_SPEECH_RATE),
    userId: readEnvValue(env.DOUBAO_TTS_USER_ID) || DOUBAO_TTS_USER_ID,
    ...(emotion ? { emotion } : {}),
    ...(Number.isFinite(emotionScale) ? { emotionScale } : {}),
  };
}

function buildDoubaoHeaders(config: TtsProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Request-Id": randomUUID(),
  };

  if (config.auth.kind === "api-key") {
    headers["X-Api-Key"] = config.auth.apiKey;
  } else {
    headers["X-Api-App-Id"] = config.auth.appId;
    headers["X-Api-Access-Key"] = config.auth.accessKey;
  }

  headers["X-Api-Resource-Id"] = config.resourceId;
  return headers;
}

function buildDoubaoBody(text: string, config: TtsProviderConfig): string {
  return JSON.stringify({
    user: {
      uid: config.userId,
    },
    req_params: {
      text,
      speaker: config.speaker,
      audio_params: {
        format: config.audioFormat,
        sample_rate: config.sampleRate,
        speech_rate: config.speechRate,
      },
      ...(config.emotion ? { emotion: config.emotion } : {}),
      ...(config.emotionScale !== undefined ? { emotion_scale: config.emotionScale } : {}),
    },
  });
}

function appendDoubaoAudioChunk(payload: string, audioChunks: Buffer[]) {
    let event: DoubaoSseEvent;
    try {
      event = JSON.parse(payload) as DoubaoSseEvent;
    } catch (error) {
      throw new Error(`Invalid Doubao TTS SSE payload: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    if (event.code && event.code !== 0 && event.code !== 20000000) {
      if (event.message && isCredentialErrorMessage(event.message)) {
        throw new Error("Doubao TTS credentials are invalid");
      }
      if (event.message && isResourceNotGrantedMessage(event.message)) {
        throw new Error("Doubao TTS resource is not granted");
      }
      throw new Error(event.message || `Doubao TTS failed with code ${event.code}`);
    }

    if (event.data) {
      audioChunks.push(Buffer.from(event.data, "base64"));
    }
}

function extractDoubaoAudioChunks(responseText: string): Buffer[] {
  const audioChunks: Buffer[] = [];
  const trimmedResponse = responseText.trim();

  if (trimmedResponse.startsWith("{")) {
    for (const payload of trimmedResponse.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      appendDoubaoAudioChunk(payload, audioChunks);
    }
  } else {
    for (const rawLine of responseText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;

      appendDoubaoAudioChunk(payload, audioChunks);
    }
  }

  if (audioChunks.length === 0) {
    throw new Error("Doubao TTS returned no audio data");
  }

  return audioChunks;
}

export async function generateNarrationAudio({
  text,
  config = getTtsProviderConfig(),
  fetcher = fetch,
}: {
  text: string;
  config?: TtsProviderConfig | null;
  fetcher?: TtsFetch;
}): Promise<Buffer | null> {
  const input = text.trim();
  if (!input || !config) return null;

  const response = await withDoubaoConnectionRetry(() =>
    fetcher(config.endpoint, {
      method: "POST",
      headers: buildDoubaoHeaders(config),
      body: buildDoubaoBody(input, config),
    }),
  );

  const responseText = await response.text();
  if (!response.ok) {
    if (isCredentialErrorMessage(responseText)) {
      throw new Error("Doubao TTS credentials are invalid");
    }
    if (isResourceNotGrantedMessage(responseText)) {
      throw new Error("Doubao TTS resource is not granted");
    }
    throw new Error(`Doubao TTS request failed with ${response.status}: ${responseText || response.statusText}`);
  }

  return Buffer.concat(extractDoubaoAudioChunks(responseText));
}
