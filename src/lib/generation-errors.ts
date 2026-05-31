import { isDoubaoConnectionError } from "./doubao-network";

type GenerationErrorPayload = {
  error: string;
  status: number;
};

function getNestedString(value: unknown, path: string[]): string {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return "";
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : "";
}

export function getGenerationErrorResponse(error: unknown): GenerationErrorPayload {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;

  const message = [
    error instanceof Error ? error.message : "",
    getNestedString(error, ["error", "message"]),
    getNestedString(error, ["error", "error", "message"]),
  ]
    .join(" ")
    .toLowerCase();

  if (status === 401 && (message.includes("api key") || message.includes("incorrect"))) {
    return {
      error:
        "豆包认证失败：请检查 .env 里的 DOUBAO_API_KEY 是否有效，并确认 DOUBAO_STORY_MODEL / DOUBAO_IMAGE_MODEL 属于同一个火山账号且已开通。",
      status: 502,
    };
  }

  if (message.includes("doubao_api_key")) {
    return {
      error:
        "本地豆包配置缺失：请在 .env 中填写 DOUBAO_API_KEY、DOUBAO_STORY_MODEL 和 DOUBAO_IMAGE_MODEL，然后运行 npm run doctor。",
      status: 500,
    };
  }

  if (message.includes("parameter `size`") || message.includes("image size must be at least")) {
    return {
      error:
        "图片尺寸配置不兼容：当前图片模型不支持这个尺寸。请检查 DOUBAO_IMAGE_MODEL，并把 DOUBAO_IMAGE_SIZE=2K 或改成该模型支持的更大尺寸。",
      status: 502,
    };
  }

  if (error instanceof Error && error.name === "StoryJsonParseError") {
    return {
      error:
        "故事生成返回格式异常：请检查 DOUBAO_STORY_MODEL 是否是聊天/文本生成模型，并查看终端日志里的 story response preview。",
      status: 502,
    };
  }

  if (status === 429 || message.includes("rate limit")) {
    return {
      error: "豆包请求过于频繁：请稍后重试，或在火山控制台检查当前模型的限流配置。",
      status: 429,
    };
  }

  if (isDoubaoConnectionError(error)) {
    return {
      error:
        "豆包网络连接失败：当前机器无法连接火山方舟 API。程序会自动尝试 IPv6 DNS 重试；如果仍失败，请检查本机网络、代理/VPN、IPv6 连接或防火墙设置。",
      status: 503,
    };
  }

  if (message.includes("credit") || message.includes("quota") || message.includes("billing")) {
    return {
      error: "豆包账户额度不足或计费未开启：请到火山控制台检查账户余额、模型服务开通状态和用量限制。",
      status: 402,
    };
  }

  if (
    status === 503 ||
    message.includes("service temporarily unavailable") ||
    message.includes("bad_response_status_code") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return {
      error:
        "豆包服务暂时不可用或请求超时：请稍后重试。若经常超时，可以在 .env 中适当调大 DOUBAO_STORY_TIMEOUT_MS 或 DOUBAO_IMAGE_TIMEOUT_MS。",
      status: 503,
    };
  }

  return {
    error: "生成失败：暂时无法判断具体原因。请查看终端日志中的 [generation-job] failed 记录，然后重试。",
    status: 500,
  };
}
