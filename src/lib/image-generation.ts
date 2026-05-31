import OpenAI from "openai";
import { withDoubaoConnectionRetry } from "./doubao-network";
import {
  getDoubaoImageProviderConfig,
  type DoubaoImageProviderConfig,
} from "./image-provider";
import type { ImageReference } from "./reference-collage";

export type ImageReferenceMode = "character" | "inspiration";
export type { ImageReference };

const DEFAULT_IMAGE_TIMEOUT_MS = 180_000;
const DEFAULT_IMAGE_MAX_RETRIES = 0;
const MIN_SEEDREAM_5_IMAGE_PIXELS = 3_686_400;
const ALLOWED_DOUBAO_IMAGE_SIZES = new Set([
  "1024x1024",
  "1536x1536",
  "1920x1920",
  "2048x2048",
  "2K",
  "4K",
]);

type DoubaoImageSizeEnv = Record<string, string | undefined> & {
  DOUBAO_IMAGE_SIZE?: string;
};

type ImageResponseLike = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

type DoubaoImageGenerateBody = {
  model: string;
  prompt: string;
  n: number;
  size: string;
  image?: string | string[];
};

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getDoubaoImageClient(config: DoubaoImageProviderConfig) {
  return {
    client: new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: getPositiveIntegerEnv("DOUBAO_IMAGE_TIMEOUT_MS", DEFAULT_IMAGE_TIMEOUT_MS),
      maxRetries: getPositiveIntegerEnv("DOUBAO_IMAGE_MAX_RETRIES", DEFAULT_IMAGE_MAX_RETRIES),
    }),
    model: config.model,
  };
}

export async function generateImage({
  prompt,
  pageText,
  referenceImage,
  referenceImages,
  referenceCharacterPrompt,
  referenceMode,
  style,
}: {
  prompt: string;
  pageText?: string;
  referenceImage?: ImageReference;
  referenceImages?: ImageReference[];
  referenceCharacterPrompt?: string;
  referenceMode?: ImageReferenceMode;
  style: string;
}): Promise<string> {
  return generateImageWithDoubao({
    config: getDoubaoImageProviderConfig(),
    prompt,
    pageText,
    referenceImage,
    referenceImages,
    referenceCharacterPrompt,
    referenceMode,
    style,
  });
}

async function generateImageWithDoubao({
  config,
  prompt,
  pageText,
  referenceImage,
  referenceImages,
  referenceCharacterPrompt,
  referenceMode,
  style,
}: {
  config: DoubaoImageProviderConfig | null;
  prompt: string;
  pageText?: string;
  referenceImage?: ImageReference;
  referenceImages?: ImageReference[];
  referenceCharacterPrompt?: string;
  referenceMode?: ImageReferenceMode;
  style: string;
}): Promise<string> {
  if (!config) {
    throw new Error("DOUBAO_API_KEY and DOUBAO_IMAGE_MODEL must be set to use Doubao image generation.");
  }

  const { client, model } = getDoubaoImageClient(config);
  const imageReferences = getImageEditReferences({ referenceImage, referenceImages });

  console.info("[image] provider configured", {
    provider: "doubao",
    baseURL: config.baseURL,
    model,
    referenceCount: imageReferences.length,
  });

  const response = await withDoubaoConnectionRetry(() =>
    client.images.generate(buildDoubaoImageGenerateBody({
      model,
      prompt,
      pageText,
      referenceCharacterPrompt,
      referenceImages: imageReferences,
      referenceMode,
      style,
    }) as Parameters<typeof client.images.generate>[0]),
  );

  return extractImageResponseBase64(response as ImageResponseLike);
}

export function getImageEditReferences({
  referenceImage,
  referenceImages,
}: {
  referenceImage?: ImageReference;
  referenceImages?: ImageReference[];
}): ImageReference[] {
  if (referenceImages && referenceImages.length > 0) return referenceImages;
  return referenceImage ? [referenceImage] : [];
}

export function buildStyledImagePrompt({
  prompt,
  pageText,
  referenceCharacterPrompt,
  style,
  referenceMode,
  hasReferenceImages,
}: {
  prompt: string;
  pageText?: string;
  referenceCharacterPrompt?: string;
  style: string;
  referenceMode?: ImageReferenceMode;
  hasReferenceImages: boolean;
}): string {
  let styledPrompt = [
    `${prompt}.`,
    `Follow this visual style contract exactly: ${style}.`,
    "Keep this as a polished picture book illustration, but let the selected style dominate linework, texture, palette, lighting, and composition. Do not blend it into a generic warm illustration style.",
    "Show a clear story beat, not a decorative scene: make the image feel like a remembered moment by depicting precise gestures, meaningful object clues, before-and-after emotional tension, and the emotional relationship between the characters.",
  ].join(" ");

  const cleanedPageText = pageText?.replace(/\s+/g, " ").trim();
  if (cleanedPageText) {
    styledPrompt += ` Render this exact Chinese page text inside the image as part of the picture-book artwork: "${cleanedPageText}". Make the typography clear, readable, and naturally integrated into the composition. Do not add extra words or random symbols.`;
  }

  if (!hasReferenceImages) return styledPrompt;

  if (referenceCharacterPrompt) {
    styledPrompt += ` ${referenceCharacterPrompt}`;
  }

  styledPrompt +=
    referenceMode === "character"
      ? " Use the uploaded images as character appearance references. The uploaded reference image is the identity source of truth for the main character. Preserve the visible facial features, hairstyle, age impression, gender presentation, body type, and overall look while creating a new safe picture book illustration. If the scene prompt invents a conflicting identity, ignore the conflicting invented identity and keep the referenced person. Do not transform the referenced person into a child, girl, boy, older person, or different gender unless the user explicitly requested that transformation."
      : " Use the uploaded images as visual inspiration for colors, setting, objects, and mood while creating a new safe picture book illustration.";

  return styledPrompt;
}

export function getDoubaoImageSize(
  model: string,
  env: DoubaoImageSizeEnv = process.env,
): string {
  const isSeedream5 = model.includes("seedream-5");
  const configuredSize = normalizeDoubaoImageSize(env.DOUBAO_IMAGE_SIZE);
  if (configuredSize && isAllowedDoubaoImageSizeForModel(configuredSize, isSeedream5)) {
    return configuredSize;
  }

  if (configuredSize && isSeedream5) {
    console.warn("[image] ignoring DOUBAO_IMAGE_SIZE below Seedream 5 minimum", {
      configuredSize,
      minimumPixels: MIN_SEEDREAM_5_IMAGE_PIXELS,
    });
  }

  return isSeedream5 ? "2K" : "1024x1024";
}

function normalizeDoubaoImageSize(size: string | undefined): string | null {
  const configuredSize = size?.trim();
  if (!configuredSize) return null;
  const namedSize = configuredSize.toUpperCase();
  if (namedSize === "2K" || namedSize === "4K") return namedSize;
  return configuredSize;
}

function isAllowedDoubaoImageSizeForModel(size: string, isSeedream5: boolean): boolean {
  if (!ALLOWED_DOUBAO_IMAGE_SIZES.has(size)) return false;
  if (!isSeedream5) return true;
  if (size === "2K" || size === "4K") return true;

  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return false;
  return Number(match[1]) * Number(match[2]) >= MIN_SEEDREAM_5_IMAGE_PIXELS;
}

export function buildDoubaoImageGenerateBody({
  model,
  prompt,
  pageText,
  referenceCharacterPrompt,
  referenceImages,
  referenceMode,
  style,
}: {
  model: string;
  prompt: string;
  pageText?: string;
  referenceCharacterPrompt?: string;
  referenceImages: ImageReference[];
  referenceMode?: ImageReferenceMode;
  style: string;
}): DoubaoImageGenerateBody {
  const styledPrompt = buildStyledImagePrompt({
    prompt,
    pageText,
    referenceCharacterPrompt,
    style,
    referenceMode,
    hasReferenceImages: referenceImages.length > 0,
  });
  const body: DoubaoImageGenerateBody = {
    model,
    prompt: styledPrompt,
    n: 1,
    size: getDoubaoImageSize(model),
  };

  if (referenceImages.length > 0) {
    const imageDataUrls = referenceImages.map(
      (image) => `data:${image.mediaType};base64,${image.buffer.toString("base64")}`,
    );
    body.image = imageDataUrls.length === 1 ? imageDataUrls[0] : imageDataUrls;
  }

  return body;
}

export async function extractImageResponseBase64(response: ImageResponseLike): Promise<string> {
  const imageData = response.data?.[0];
  if (!imageData?.b64_json && !imageData?.url) {
    throw new Error("No image data returned from image provider");
  }

  if (imageData.b64_json) return imageData.b64_json;

  const url = imageData.url;
  if (!url) {
    throw new Error("No image data returned from image provider");
  }

  const dataUrlMatch = url.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (dataUrlMatch) return dataUrlMatch[1];

  const imageResponse = await fetch(url);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image from provider: ${imageResponse.status}`);
  }

  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  return imageBytes.toString("base64");
}
