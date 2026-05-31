type LocalReadinessEnv = Record<string, string | undefined> & {
  DATABASE_URL?: string;
  DOUBAO_API_KEY?: string;
  DOUBAO_IMAGE_MODEL?: string;
  DOUBAO_STORY_MODEL?: string;
  DOUBAO_TTS_API_KEY?: string;
};

const PLACEHOLDER_VALUES = new Set([""]);
const LOCAL_READINESS_FIX_HINT =
  "请查看 docs/doubao-setup.zh-CN.md，修改 .env 后重新运行 npm run doctor。";
const OPTIONAL_TTS_ISSUE =
  "DOUBAO_TTS_API_KEY 未填写：这是可选项；不填时仍可生成绘本，但朗读音频和 MP4 导出可能不可用。";

function isMissing(value: string | undefined): boolean {
  return PLACEHOLDER_VALUES.has(value?.trim() ?? "");
}

export function getLocalReadinessIssues(env: LocalReadinessEnv = process.env): string[] {
  const issues: string[] = [];

  if (isMissing(env.DATABASE_URL)) {
    issues.push("DATABASE_URL 缺失：请保留 .env.example 默认的本地 Postgres 连接，或填写自己的数据库连接。");
  }
  if (isMissing(env.DOUBAO_API_KEY)) {
    issues.push("DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。");
  }
  if (isMissing(env.DOUBAO_STORY_MODEL)) {
    issues.push("DOUBAO_STORY_MODEL 缺失：请填写方舟文本/聊天模型或推理接入点 ID。");
  }
  if (isMissing(env.DOUBAO_IMAGE_MODEL)) {
    issues.push("DOUBAO_IMAGE_MODEL 缺失：请填写方舟图片生成模型或推理接入点 ID。");
  }
  if (isMissing(env.DOUBAO_TTS_API_KEY)) {
    issues.push(OPTIONAL_TTS_ISSUE);
  }

  return issues;
}

export function getBlockingLocalReadinessIssues(env: LocalReadinessEnv = process.env): string[] {
  return getLocalReadinessIssues(env).filter((issue) => issue !== OPTIONAL_TTS_ISSUE);
}

export function formatLocalReadinessError(issues: string[]): string {
  return `本地配置还没完成：${issues.join("；")}${LOCAL_READINESS_FIX_HINT}`;
}
