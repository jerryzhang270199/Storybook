import {
  isSupportedImageType,
  type SupportedImageMimeType,
} from "./uploads";
import type { ReferenceCharacter } from "./reference-characters";

export const GENERATION_JOB_STATUS = {
  queued: "queued",
  generatingStory: "generating_story",
  generatingImages: "generating_images",
  generatingAudio: "generating_audio",
  savingBook: "saving_book",
  completed: "completed",
  failed: "failed",
} as const;

export type GenerationJobStatus =
  (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];

export const ACTIVE_GENERATION_JOB_STATUSES: GenerationJobStatus[] = [
  GENERATION_JOB_STATUS.queued,
  GENERATION_JOB_STATUS.generatingStory,
  GENERATION_JOB_STATUS.generatingImages,
  GENERATION_JOB_STATUS.generatingAudio,
  GENERATION_JOB_STATUS.savingBook,
];

export type StoredReferenceImage = {
  character?: ReferenceCharacter;
  filename: string;
  mediaType: SupportedImageMimeType;
  url: string;
};

function parseStoredReferenceCharacter(value: unknown): ReferenceCharacter | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const character = value as {
    isPrimary?: unknown;
    nickname?: unknown;
    referenceIndex?: unknown;
    relationshipNote?: unknown;
    roleLabel?: unknown;
  };

  if (
    typeof character.referenceIndex !== "number" ||
    !Number.isInteger(character.referenceIndex) ||
    character.referenceIndex <= 0 ||
    typeof character.roleLabel !== "string" ||
    typeof character.nickname !== "string" ||
    typeof character.isPrimary !== "boolean"
  ) {
    return undefined;
  }

  return {
    isPrimary: character.isPrimary,
    nickname: character.nickname,
    referenceIndex: character.referenceIndex,
    ...(typeof character.relationshipNote === "string"
      ? { relationshipNote: character.relationshipNote }
      : {}),
    roleLabel: character.roleLabel,
  };
}

export function parseStoredReferenceImages(value: unknown): StoredReferenceImage[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid stored reference images");
  }

  return value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { filename?: unknown }).filename !== "string" ||
      typeof (item as { mediaType?: unknown }).mediaType !== "string" ||
      typeof (item as { url?: unknown }).url !== "string" ||
      !isSupportedImageType((item as { mediaType: string }).mediaType)
    ) {
      throw new Error("Invalid stored reference images");
    }

    const character = parseStoredReferenceCharacter((item as { character?: unknown }).character);

    return {
      ...(character ? { character } : {}),
      filename: (item as { filename: string }).filename,
      mediaType: (item as { mediaType: SupportedImageMimeType }).mediaType,
      url: (item as { url: string }).url,
    };
  });
}
