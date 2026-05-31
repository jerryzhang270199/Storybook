export type DoubaoStoryProviderConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

type StoryProviderEnv = Record<string, string | undefined> & {
  DOUBAO_API_KEY?: string;
  ARK_API_KEY?: string;
  DOUBAO_BASE_URL?: string;
  ARK_BASE_URL?: string;
  DOUBAO_STORY_MODEL?: string;
  DOUBAO_TEXT_MODEL?: string;
  DOUBAO_MODEL?: string;
};

function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getDoubaoStoryProviderConfig(
  env: StoryProviderEnv = process.env,
): DoubaoStoryProviderConfig | null {
  const apiKey = (env.DOUBAO_API_KEY || env.ARK_API_KEY || "").trim();
  const model = (
    env.DOUBAO_STORY_MODEL ||
    env.DOUBAO_TEXT_MODEL ||
    env.DOUBAO_MODEL ||
    ""
  ).trim();

  if (!apiKey || !model) return null;

  return {
    apiKey,
    baseURL: normalizeBaseURL(
      env.DOUBAO_BASE_URL?.trim() ||
        env.ARK_BASE_URL?.trim() ||
        "https://ark.cn-beijing.volces.com/api/v3",
    ),
    model,
  };
}
