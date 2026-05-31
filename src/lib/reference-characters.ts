export const REFERENCE_CHARACTER_ROLE_OPTIONS = [
  { id: "father", label: "爸爸" },
  { id: "mother", label: "妈妈" },
  { id: "child", label: "孩子" },
  { id: "male", label: "男主" },
  { id: "female", label: "女主" },
  { id: "friend", label: "朋友" },
  { id: "family", label: "家人" },
  { id: "pet", label: "宠物" },
  { id: "custom", label: "自定义" },
] as const;

export type ReferenceCharacterRoleId = (typeof REFERENCE_CHARACTER_ROLE_OPTIONS)[number]["id"];

export type ReferenceCharacter = {
  isPrimary: boolean;
  nickname: string;
  referenceIndex: number;
  relationshipNote?: string;
  roleLabel: string;
};

export type ReferenceCharacterContext = {
  characters: ReferenceCharacter[];
  relationshipNote?: string;
};

const DEFAULT_ROLE_LABEL = "参考角色";
const MAX_SHORT_TEXT_LENGTH = 24;
const MAX_RELATIONSHIP_NOTE_LENGTH = 120;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeShortText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_SHORT_TEXT_LENGTH);
}

function sanitizeRelationshipNote(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_RELATIONSHIP_NOTE_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReferenceIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createDefaultContext(referenceCount: number): ReferenceCharacterContext {
  return {
    characters: Array.from({ length: referenceCount }, (_, index) => ({
      isPrimary: true,
      nickname: `参考图${index + 1}`,
      referenceIndex: index + 1,
      roleLabel: DEFAULT_ROLE_LABEL,
    })),
  };
}

export function parseReferenceCharactersFormValue(
  value: FormDataEntryValue | null,
  referenceCount: number,
): ReferenceCharacterContext {
  if (referenceCount <= 0) return { characters: [] };
  if (typeof value !== "string" || !value.trim()) {
    return createDefaultContext(referenceCount);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return createDefaultContext(referenceCount);
  }

  if (!isRecord(parsed)) return createDefaultContext(referenceCount);

  const rawCharacters = Array.isArray(parsed.characters) ? parsed.characters : [];
  const relationshipNote = sanitizeRelationshipNote(parsed.relationshipNote);
  const primaryReference =
    parsed.primaryReference === "all" ? "all" : parseReferenceIndex(parsed.primaryReference);

  const characters = Array.from({ length: referenceCount }, (_, index) => {
    const referenceIndex = index + 1;
    const rawByIndex = rawCharacters.find(
      (item) => isRecord(item) && parseReferenceIndex(item.referenceIndex) === referenceIndex,
    );
    const rawByPosition = rawCharacters[index];
    const raw = isRecord(rawByIndex)
      ? rawByIndex
      : isRecord(rawByPosition)
        ? rawByPosition
        : {};
    const roleLabel = sanitizeShortText(raw.roleLabel, DEFAULT_ROLE_LABEL);
    const nickname = sanitizeShortText(raw.nickname, roleLabel || `参考图${referenceIndex}`);

    return {
      isPrimary: primaryReference === "all" || primaryReference === referenceIndex,
      nickname,
      referenceIndex,
      ...(relationshipNote ? { relationshipNote } : {}),
      roleLabel,
    };
  });

  if (!characters.some((character) => character.isPrimary)) {
    return {
      ...(relationshipNote ? { relationshipNote } : {}),
      characters: characters.map((character) => ({ ...character, isPrimary: true })),
    };
  }

  return {
    ...(relationshipNote ? { relationshipNote } : {}),
    characters,
  };
}

export function buildReferenceCharacterStoryPrompt(
  context: ReferenceCharacterContext,
): string {
  if (context.characters.length === 0) return "";

  const characterLines = context.characters.map((character) => {
    const priority = character.isPrimary ? "主角" : "陪伴角色";
    return `- 参考图 ${character.referenceIndex} = ${character.nickname}（身份：${character.roleLabel}，${priority}）`;
  });
  const primaryNames = context.characters
    .filter((character) => character.isPrimary)
    .map((character) => character.nickname)
    .join("、");

  return [
    "角色设定（必须严格遵守）：",
    ...characterLines,
    `主角：${primaryNames || "所有参考角色"}`,
    context.relationshipNote ? `关系补充：${context.relationshipNote}` : null,
    "执行要求：",
    "- 不要合并多个角色，不要交换身份，不要把成年人画成孩子，也不要把孩子画成成年人。",
    "- 每页 imagePrompt 都要明确写出出现了哪些参考图角色，以及他们之间正在发生什么互动。",
    "- 如果用户的场景描述和角色设定冲突，以角色设定为准。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildReferenceCharacterImagePrompt(
  context: ReferenceCharacterContext,
): string {
  if (context.characters.length === 0) return "";

  const lines = context.characters.map((character) => {
    const priority = character.isPrimary ? "Primary story character" : "Supporting character";
    return `- Reference image ${character.referenceIndex} is ${character.nickname}, role: ${character.roleLabel}, ${priority}.`;
  });

  return [
    "Character reference mapping:",
    ...lines,
    context.relationshipNote ? `Relationship note: ${context.relationshipNote}.` : null,
    "Do not merge different people. Do not swap identities between reference images. Preserve each referenced person's visible age impression, gender presentation, hairstyle, facial features, and overall look.",
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}
