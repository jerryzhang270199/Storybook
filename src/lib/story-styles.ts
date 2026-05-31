export const STYLE_OPTIONS = [
  {
    id: "watercolor",
    name: "水彩绘本",
    description: "纸感和水彩晕染明显，适合温暖生活片段",
    thumbnailUrl: "/style-previews/watercolor.webp",
    prompt: [
      "Strict watercolor picture-book style contract:",
      "translucent watercolor washes, visible cold-press paper grain, soft bleeding edges, low-contrast pencil underdrawing, warm natural light, gentle layered shadows, airy negative space, muted pastel palette.",
      "Avoid clean vector outlines, glossy 3D rendering, plastic texture, anime cel shading, comic panel layouts, and dense painterly realism.",
    ].join(" "),
  },
  {
    id: "cartoon",
    name: "卡通绘本",
    description: "轮廓清楚、色块干净，人物辨识度更强",
    thumbnailUrl: "/style-previews/cartoon.webp",
    prompt: [
      "Strict clean cartoon picture-book style contract:",
      "bold simple silhouettes, clear ink outlines, smooth flat color blocks, high readability at thumbnail size, expressive faces, tidy background shapes, bright balanced palette.",
      "Avoid watercolor bleeding, vintage paper aging, pencil sketch texture, cinematic realism, dense painterly detail, and soft hazy lighting.",
    ].join(" "),
  },
  {
    id: "comic_panel",
    name: "漫画分镜",
    description: "多格分镜、动作线更强，适合连续剧情",
    thumbnailUrl: "/style-previews/comic-panel.webp",
    prompt: [
      "Strict comic panel storybook style contract:",
      "create a single square storybook page composed of 2-3 distinct comic panels, with visible panel borders and gutters, varied shot sizes such as wide shot, close-up, and reaction shot, dynamic camera angles, motion lines or action beats where appropriate, clean ink linework, stronger foreground-background separation, expressive poses, crisp visual narration without speech bubbles.",
      "Avoid single full-page cartoon illustration, soft watercolor wash, static portrait-only composition, vintage paper texture, 3D rendering, and overly gentle postcard framing.",
    ].join(" "),
  },
  {
    id: "toy_3d",
    name: "3D 玩具绘本",
    description: "软陶玩具质感，适合亲子、生日和旅行",
    thumbnailUrl: "/style-previews/toy-3d.webp",
    prompt: [
      "Strict 3D toy storybook style contract:",
      "soft 3D toy animation look, clay-like characters, rounded shapes, miniature diorama set, tactile fabric and paper props, gentle studio lighting, shallow depth of field, playful handcrafted objects, cozy family-friendly set design, charming stop-motion storybook feeling.",
      "Avoid flat 2D cartoon, watercolor texture, comic panel layout, realistic photography, glossy plastic action-figure look, hard sci-fi rendering, and uncanny realistic skin.",
    ].join(" "),
  },
] as const;

export type StoryStyleOption = (typeof STYLE_OPTIONS)[number];
export type StoryStyleId = StoryStyleOption["id"];

export const DEFAULT_STORY_STYLE_ID: StoryStyleId = "watercolor";

const STYLE_BY_ID = new Map<string, StoryStyleOption>(
  STYLE_OPTIONS.map((style) => [style.id, style]),
);

const DEPRECATED_STYLE_ALIASES = new Map<string, StoryStyleId>([
  ["classic_storybook", "watercolor"],
  ["healing_handdrawn", "watercolor"],
  ["vintage_storybook", "watercolor"],
]);

export function parseStoryStyle(value: unknown): StoryStyleOption {
  if (value == null) {
    return STYLE_BY_ID.get(DEFAULT_STORY_STYLE_ID)!;
  }

  if (typeof value !== "string") {
    throw new Error("Unsupported story style");
  }

  const styleId = value.trim();
  if (!styleId) {
    return STYLE_BY_ID.get(DEFAULT_STORY_STYLE_ID)!;
  }

  const resolvedStyleId = DEPRECATED_STYLE_ALIASES.get(styleId) ?? styleId;
  const style = STYLE_BY_ID.get(resolvedStyleId);
  if (!style) {
    throw new Error(`Unsupported story style: ${styleId}`);
  }

  return style;
}
