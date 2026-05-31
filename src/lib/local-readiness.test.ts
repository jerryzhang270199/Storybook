import assert from "node:assert/strict";
import test from "node:test";

import { formatLocalReadinessError, getLocalReadinessIssues } from "./local-readiness";

test("getLocalReadinessIssues reports required localhost configuration", () => {
  const issues = getLocalReadinessIssues({});

  assert.equal(issues.includes("DATABASE_URL 缺失：请保留 .env.example 默认的本地 Postgres 连接，或填写自己的数据库连接。"), true);
  assert.equal(issues.includes("DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。"), true);
  assert.equal(issues.includes("DOUBAO_STORY_MODEL 缺失：请填写方舟文本/聊天模型或推理接入点 ID。"), true);
  assert.equal(issues.includes("DOUBAO_IMAGE_MODEL 缺失：请填写方舟图片生成模型或推理接入点 ID。"), true);
  assert.equal(
    issues.includes("DOUBAO_TTS_API_KEY 未填写：这是可选项；不填时仍可生成绘本，但朗读音频和 MP4 导出可能不可用。"),
    true,
  );
  assert.equal(issues.some((issue) => issue.includes("RESEND")), false);
});

test("getLocalReadinessIssues accepts a complete Doubao localhost setup", () => {
  const issues = getLocalReadinessIssues({
    DATABASE_URL: "postgresql://storybook:storybook@localhost:5432/storybook?schema=public",
    DOUBAO_API_KEY: "doubao-key",
    DOUBAO_IMAGE_MODEL: "doubao-image",
    DOUBAO_STORY_MODEL: "doubao-story",
  });

  assert.deepEqual(issues, [
    "DOUBAO_TTS_API_KEY 未填写：这是可选项；不填时仍可生成绘本，但朗读音频和 MP4 导出可能不可用。",
  ]);
});

test("getLocalReadinessIssues rejects placeholder values", () => {
  const issues = getLocalReadinessIssues({
    DATABASE_URL: "postgresql://storybook:storybook@localhost:5432/storybook?schema=public",
    DOUBAO_API_KEY: "",
    DOUBAO_IMAGE_MODEL: "doubao-image",
    DOUBAO_STORY_MODEL: "doubao-story",
  });

  assert.equal(issues.includes("DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。"), true);
});

test("formatLocalReadinessError gives a user-facing local setup hint", () => {
  assert.equal(
    formatLocalReadinessError([
      "DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。",
      "DOUBAO_IMAGE_MODEL 缺失：请填写方舟图片生成模型或推理接入点 ID。",
    ]),
    "本地配置还没完成：DOUBAO_API_KEY 缺失：请填写火山引擎方舟 API Key。；DOUBAO_IMAGE_MODEL 缺失：请填写方舟图片生成模型或推理接入点 ID。请查看 docs/doubao-setup.zh-CN.md，修改 .env 后重新运行 npm run doctor。",
  );
});
