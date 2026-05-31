import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
import OpenAI from "openai";
import { getDoubaoImageSize } from "../src/lib/image-generation";
import {
  getDoubaoImageProviderConfig,
  type DoubaoImageProviderConfig,
} from "../src/lib/image-provider";
import {
  getDoubaoStoryProviderConfig,
  type DoubaoStoryProviderConfig,
} from "../src/lib/story-provider";
import {
  generateNarrationAudio,
  getTtsProviderConfig,
  type TtsProviderConfig,
} from "../src/lib/tts-provider";
import { getBlockingLocalReadinessIssues } from "../src/lib/local-readiness";
import { getGenerationErrorResponse } from "../src/lib/generation-errors";

type DoubaoDoctorEnv = Record<string, string | undefined>;

type DoubaoDoctorConfig =
  | {
      image: DoubaoImageProviderConfig;
      imageSize: string;
      issues: [];
      ok: true;
      story: DoubaoStoryProviderConfig;
      tts: TtsProviderConfig | null;
    }
  | {
      image: null;
      imageSize: null;
      issues: string[];
      ok: false;
      story: null;
      tts: null;
    };

function getPositiveIntegerEnv(env: DoubaoDoctorEnv, name: string, fallback: number): number {
  const value = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildDoubaoDoctorConfig(env: DoubaoDoctorEnv = process.env): DoubaoDoctorConfig {
  const issues = getBlockingLocalReadinessIssues(env).filter((issue) =>
    issue.startsWith("DOUBAO_"),
  );
  const story = getDoubaoStoryProviderConfig(env);
  const image = getDoubaoImageProviderConfig(env);
  const tts = getTtsProviderConfig(env);

  if (issues.length > 0 || !story || !image) {
    return {
      image: null,
      imageSize: null,
      issues,
      ok: false,
      story: null,
      tts: null,
    };
  }

  return {
    image,
    imageSize: getDoubaoImageSize(image.model, env),
    issues: [],
    ok: true,
    story,
    tts,
  };
}

export function shouldRunImageProbe(args = process.argv.slice(2)) {
  return args.includes("--check-image");
}

export function shouldRunTtsProbe(args = process.argv.slice(2)) {
  return args.includes("--check-tts");
}

export function formatDoubaoDoctorError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Doubao TTS credentials are invalid")) {
    return "豆包 TTS 凭证无效：DOUBAO_API_KEY 不能用于语音合成，请检查 DOUBAO_TTS_API_KEY。";
  }
  if (message.includes("Doubao TTS resource is not granted")) {
    return "豆包 TTS 资源未开通：请检查 DOUBAO_TTS_RESOURCE_ID 和当前账号的语音资源授权。";
  }
  return getGenerationErrorResponse(error).error;
}

async function checkStoryModel(config: DoubaoStoryProviderConfig, env: DoubaoDoctorEnv) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: getPositiveIntegerEnv(env, "DOUBAO_STORY_TIMEOUT_MS", 90_000),
    maxRetries: getPositiveIntegerEnv(env, "DOUBAO_STORY_MAX_RETRIES", 0),
  });

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: "Return only OK.",
      },
      {
        role: "user",
        content: "请只回复 OK，用于测试模型连通性。",
      },
    ],
    max_tokens: 8,
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Doubao story model returned an empty response.");
  }
}

async function checkImageModel(config: DoubaoImageProviderConfig, imageSize: string, env: DoubaoDoctorEnv) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: getPositiveIntegerEnv(env, "DOUBAO_IMAGE_TIMEOUT_MS", 180_000),
    maxRetries: getPositiveIntegerEnv(env, "DOUBAO_IMAGE_MAX_RETRIES", 0),
  });

  const response = await client.images.generate({
    model: config.model,
    prompt: "A tiny warm picture book style star on a plain white background.",
    n: 1,
    size: imageSize,
  } as Parameters<typeof client.images.generate>[0]);

  const imageData = (response as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];
  if (!imageData?.b64_json && !imageData?.url) {
    throw new Error("Doubao image model returned no image data.");
  }
}

async function checkTtsProvider(config: TtsProviderConfig) {
  const audio = await generateNarrationAudio({
    text: "你好",
    config,
  });

  if (!audio || audio.length === 0) {
    throw new Error("Doubao TTS returned no audio data");
  }
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    console.error("缺少 .env。请先运行：npm run init:local");
    process.exit(1);
  }

  loadDotenv({ path: envPath, quiet: true });

  const config = buildDoubaoDoctorConfig();
  if (!config.ok) {
    console.error("豆包配置还没完成：");
    for (const issue of config.issues) {
      console.error(`- ${issue}`);
    }
    console.error("\n请查看 docs/doubao-setup.zh-CN.md，修改 .env 后重新运行 npm run doctor:doubao。");
    process.exit(1);
  }

  console.log("豆包配置：");
  console.log(`- baseURL: ${config.story.baseURL}`);
  console.log(`- story model: ${config.story.model}`);
  console.log(`- image model: ${config.image.model}`);
  console.log(`- image size: ${config.imageSize}`);
  console.log(
    `- tts: ${config.tts ? `${config.tts.resourceId} / ${config.tts.speaker}` : "未配置"}`,
  );

  try {
    console.log("\n正在验证故事模型连通性...");
    await checkStoryModel(config.story, process.env);
    console.log("故事模型验证通过。");
  } catch (error) {
    console.error(`故事模型验证失败：${formatDoubaoDoctorError(error)}`);
    process.exit(1);
  }

  if (!shouldRunImageProbe()) {
    console.log(
      "\n图片模型配置已解析。默认不会发起图片生成请求；如需真实验证图片接口，请运行：npm run doctor:doubao -- --check-image",
    );
  }

  if (shouldRunImageProbe()) {
    try {
      console.log("\n正在验证图片模型连通性，这会发起一次真实图片生成请求...");
      await checkImageModel(config.image, config.imageSize, process.env);
      console.log("图片模型验证通过。");
    } catch (error) {
      console.error(`图片模型验证失败：${formatDoubaoDoctorError(error)}`);
      process.exit(1);
    }
  }

  if (!shouldRunTtsProbe()) {
    console.log(
      "\nTTS 配置已解析。默认不会发起 TTS 请求；如需真实验证语音合成，请运行：npm run doctor:doubao -- --check-tts",
    );
    return;
  }

  if (!config.tts) {
    console.error(
      "\nTTS 验证失败：DOUBAO_TTS_API_KEY 未配置。请先在 .env 中填写 TTS 凭证，或跳过 --check-tts。",
    );
    process.exit(1);
  }

  try {
    console.log("\n正在验证 TTS 连通性，这会发起一次真实语音合成请求...");
    await checkTtsProvider(config.tts);
    console.log("TTS 验证通过。");
  } catch (error) {
    console.error(`TTS 验证失败：${formatDoubaoDoctorError(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
