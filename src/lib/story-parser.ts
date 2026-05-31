import { jsonrepair } from "jsonrepair";

export interface StoryPage {
  text: string;
  imagePrompt: string;
}

export interface GeneratedStory {
  title: string;
  pages: StoryPage[];
}

export class StoryJsonParseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoryJsonParseError";
  }
}

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fenced ? fenced[1].trim() : trimmed;

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new StoryJsonParseError("Story response did not contain a JSON object.", rawText);
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function isStoryPage(value: unknown): value is StoryPage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoryPage).text === "string" &&
    typeof (value as StoryPage).imagePrompt === "string"
  );
}

function assertGeneratedStory(value: unknown, rawText: string): GeneratedStory {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as GeneratedStory).title !== "string" ||
    !Array.isArray((value as GeneratedStory).pages) ||
    !(value as GeneratedStory).pages.every(isStoryPage)
  ) {
    throw new StoryJsonParseError("Story response JSON did not match the expected shape.", rawText);
  }

  return value as GeneratedStory;
}

export function parseGeneratedStory(rawText: string): GeneratedStory {
  const candidate = extractJsonCandidate(rawText);

  try {
    return assertGeneratedStory(JSON.parse(candidate), rawText);
  } catch (parseError) {
    try {
      return assertGeneratedStory(JSON.parse(jsonrepair(candidate)), rawText);
    } catch (repairError) {
      throw new StoryJsonParseError("Story response was not valid JSON.", rawText, repairError || parseError);
    }
  }
}

export function normalizeGeneratedStoryPageCount(
  story: GeneratedStory,
  requestedPageCount: number,
): GeneratedStory {
  const pageCount = Math.max(1, Math.floor(requestedPageCount));
  const pages = story.pages.slice(0, pageCount);

  while (pages.length < pageCount) {
    const pageNumber = pages.length + 1;
    const isFinalPage = pageNumber === pageCount;
    pages.push({
      text: isFinalPage ? "故事还在心里轻轻发光。" : story.title,
      imagePrompt:
        `A gentle closing illustration for "${story.title}", showing the main characters in a warm picture book scene with rich environmental details, emotional connection, layered background, cinematic composition, soft light, and a clear story moment.`,
    });
  }

  return {
    ...story,
    pages,
  };
}

export function getStoryResponsePreview(rawText: string, maxLength: number = 1200): string {
  return rawText.length <= maxLength ? rawText : `${rawText.slice(0, maxLength)}...`;
}
