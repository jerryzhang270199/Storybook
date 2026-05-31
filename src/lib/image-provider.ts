export type DoubaoImageProviderConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

type ImageProviderEnv = Record<string, string | undefined> & {
  DOUBAO_API_KEY?: string;
  ARK_API_KEY?: string;
  DOUBAO_BASE_URL?: string;
  ARK_BASE_URL?: string;
  DOUBAO_IMAGE_MODEL?: string;
};

function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getDoubaoImageProviderConfig(
  env: ImageProviderEnv = process.env,
): DoubaoImageProviderConfig | null {
  const apiKey = (env.DOUBAO_API_KEY || env.ARK_API_KEY || "").trim();
  const model = (env.DOUBAO_IMAGE_MODEL || "").trim();

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
