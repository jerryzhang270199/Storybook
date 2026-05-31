import OpenAI from "openai";
import { withDoubaoConnectionRetry } from "./doubao-network";
import {
  getDoubaoStoryProviderConfig,
  type DoubaoStoryProviderConfig,
} from "./story-provider";
import {
  getStoryResponsePreview,
  normalizeGeneratedStoryPageCount,
  parseGeneratedStory,
  type GeneratedStory,
  type StoryPage,
  StoryJsonParseError,
} from "./story-parser";
import type { SupportedImageMimeType } from "./uploads";

export type { GeneratedStory, StoryPage };

export type StoryReferenceImage = {
  base64: string;
  mediaType: SupportedImageMimeType;
};

const DEFAULT_STORY_TIMEOUT_MS = 90_000;
const DEFAULT_STORY_MAX_RETRIES = 0;

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildStorySystemPrompt(): string {
  return `你是一位专业的绘本作家、分镜设计师、情感叙事编辑和内容安全编辑。你的任务是把用户给出的片段写成温暖、清晰、全年龄可读、适合分享，并且像真实难忘回忆一样具体感人的绘本故事，同时为每一页生成可直接用于 AI 生图的英文插图提示词。

输出要求：
- 必须返回严格 JSON，不得输出 markdown 代码块、解释、前后缀或其他内容
- JSON 顶层必须包含 "title" 和 "pages"
- "pages" 中每一项必须包含 "text" 和 "imagePrompt"
- text 是这一页的故事文字，使用用户要求的语言，1-3句话，简洁有趣
- text 不只是说明画面，要呈现具体记忆、情感递进和关系变化；感人来自动作、停顿、表情、物件、声音和没说出口的舍不得，不要堆砌抽象煽情词
- imagePrompt 必须用英文写，要详细具体，包含具体生活动作、角色互动、情绪变化、场景物件、时间天气、光线色彩、前中后景、镜头构图和绘本风格
- 每页的 imagePrompt 都要包含一致的角色描述，避免主角外貌在不同页面漂移
- 每一页都必须有画面叙事：角色正在做一件具体的事，画面中要有能推动故事的物件、姿态或小冲突，避免只写 portrait, smiling, standing, simple background
- imagePrompt 应该像电影分镜一样丰富：foreground / midground / background 都要有内容，但不要生成真实摄影风格
- imagePrompt 必须画出这一页的情绪节点和故事后果，让画面像被认真记住的一刻，而不是只有漂亮背景或静态摆拍
- 第一页是封面，text 为标题，imagePrompt 为封面插图描述
- 最后一页是封底，text 为结束语
- 字符串内如需引号必须转义为 \\"，不得使用尾随逗号

内容安全要求：
- 内容必须适合全年龄阅读和公开分享
- 避免恐怖、血腥、色情、仇恨、危险指导或其他不适合公开分享的内容
- 如果用户描述含有不适合公开分享的元素，改写为安全、温和、富有想象力的绘本表达。`;
}

export function buildStoryUserPrompt({
  description,
  photoUsage,
  referenceCharacterPrompt,
  style,
  referenceCount,
  pageCount,
  language,
}: {
  description: string;
  photoUsage: "character" | "inspiration";
  referenceCharacterPrompt?: string;
  style: string;
  referenceCount: number;
  pageCount: number;
  language: string;
}): string {
  const langInstruction = language === "zh" ? "用中文写故事" : "Write the story in English";
  const photoContext =
    photoUsage === "character"
      ? `用户上传了${referenceCount || 1}张照片作为故事主角的外貌参考。参考照片中的人物是主角身份的最高优先级。请综合这些照片中的稳定外貌特征，在画面描述中包含主角的外貌特征描述，确保每页的主角形象一致。不要凭空把参考主角改成小孩、女孩、老人或其他性别年龄身份；如果用户没有明确要求，不要新造一个替代主角。每页 imagePrompt 必须包含英文短语 "the main character from the uploaded reference photo"，并要求生图模型 preserve the referenced person's visible age impression, gender presentation, hairstyle, facial features, and overall look。`
      : `用户上传了${referenceCount || 1}张照片作为故事灵感。请从这些照片中汲取适合绘本表达的创意元素、颜色、场景、物件或氛围融入故事。`;

  return `请根据以下信息创作一本绘本故事。

故事描述：${description}
绘本风格：${style}
页数：${pageCount}页（含封面和封底）
${photoContext}
${referenceCharacterPrompt ? `\n${referenceCharacterPrompt}\n` : ""}
${langInstruction}

硬性页数要求：
- 必须刚好返回 ${pageCount} 个 pages 项，不要多，不要少
- pages 数组长度必须等于 ${pageCount}

故事性要求：
- 每一页都要推进故事，不要只是同一个人物换背景
- 每页设计一个明确的动作或关系变化，例如准备、尝试、遇到小问题、互相帮助、完成、回望
- 先从故事描述中提取 2-4 个记忆锚点，例如人物之间的称呼、地点、动作、物件、表情、声音、触感或一句舍不得的话，并把这些锚点自然分配到页面里
- 整本书必须有情绪递进和关系变化：从一个具体瞬间开始，中段通过动作、信任、陪伴、小小冲突或分别推进，结尾落到被记住、被爱、成长或回望
- 不要把用户描述改写成泛泛的漂亮场景；每一页都要像真实发生过的一刻，有可看见的细节和可感受到的情绪
- 感人要来自具体细节和克制表达，不要堆砌“很感动、很温暖、永远爱你”这类抽象句子
- imagePrompt 要把用户描述扩写成可画出来的丰富场面，不能只写简单头像或静态合影
- 如果上传照片作为主角参考，imagePrompt 每页都要保留主角稳定外貌，同时让人物参与具体事件

请返回符合以下结构的 JSON：
{
  "title": "故事标题",
  "pages": [
    {
      "text": "这一页的故事文字",
      "imagePrompt": "Detailed English image prompt for this page. Include consistent character appearance, memory anchors from the user's story, specific story action, emotional beat, relationship change, interaction, setting objects, foreground, midground, background, time of day, lighting, emotion, composition, and style: ${style}"
    }
  ]
}`;
}

export async function generateStory({
  description,
  photoUsage,
  style,
  referenceImage,
  referenceImages,
  referenceCharacterPrompt,
  referenceCount,
  pageCount = 8,
  language = "zh",
}: {
  description: string;
  photoUsage: "character" | "inspiration";
  style: string;
  referenceImage?: StoryReferenceImage;
  referenceImages?: StoryReferenceImage[];
  referenceCharacterPrompt?: string;
  referenceCount?: number;
  pageCount?: number;
  language?: string;
}): Promise<GeneratedStory> {
  return generateStoryWithDoubao({
    config: getDoubaoStoryProviderConfig(),
    description,
    photoUsage,
    style,
    referenceImage,
    referenceImages,
    referenceCharacterPrompt,
    referenceCount,
    pageCount,
    language,
  });
}

async function generateStoryWithDoubao({
  config,
  description,
  photoUsage,
  style,
  referenceImage,
  referenceImages,
  referenceCharacterPrompt,
  referenceCount,
  pageCount = 8,
  language = "zh",
}: {
  config: DoubaoStoryProviderConfig | null;
  description: string;
  photoUsage: "character" | "inspiration";
  style: string;
  referenceImage?: StoryReferenceImage;
  referenceImages?: StoryReferenceImage[];
  referenceCharacterPrompt?: string;
  referenceCount?: number;
  pageCount?: number;
  language?: string;
}): Promise<GeneratedStory> {
  if (!config) {
    throw new Error("DOUBAO_API_KEY and DOUBAO_STORY_MODEL must be set to use Doubao story generation.");
  }

  const timeout = getPositiveIntegerEnv("DOUBAO_STORY_TIMEOUT_MS", DEFAULT_STORY_TIMEOUT_MS);
  const maxRetries = getPositiveIntegerEnv("DOUBAO_STORY_MAX_RETRIES", DEFAULT_STORY_MAX_RETRIES);
  console.info("[story] provider configured", {
    provider: "doubao",
    baseURL: config.baseURL,
    model: config.model,
    timeout,
    maxRetries,
  });

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout,
    maxRetries,
  });

  const availableReferenceImages = referenceImages ?? (referenceImage ? [referenceImage] : []);
  const promptReferenceCount = referenceCount ?? availableReferenceImages.length;
  const prompt = buildStoryUserPrompt({
    description,
    photoUsage,
    referenceCharacterPrompt,
    style,
    referenceCount: promptReferenceCount,
    pageCount,
    language,
  });

  const completion = await withDoubaoConnectionRetry(() =>
    client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: buildStorySystemPrompt(),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4096,
    }),
  );

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Unexpected response type from Doubao story generation");
  }

  try {
    const story = parseGeneratedStory(content);
    if (story.pages.length === 0) {
      throw new StoryJsonParseError("Doubao returned a story with no pages.", content);
    }
    return normalizeGeneratedStoryPageCount(story, pageCount);
  } catch (error) {
    if (error instanceof StoryJsonParseError) {
      console.error("[story] failed to parse provider response", {
        provider: "doubao",
        message: error.message,
        responsePreview: getStoryResponsePreview(error.rawText),
      });
    }
    throw error;
  }
}
