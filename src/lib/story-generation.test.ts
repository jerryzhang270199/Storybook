import assert from "node:assert/strict";
import test from "node:test";

import { buildStorySystemPrompt, buildStoryUserPrompt } from "./story-generation";

test("buildStorySystemPrompt contains fixed role and JSON output rules", () => {
  const systemPrompt = buildStorySystemPrompt();

  assert.match(systemPrompt, /专业的绘本作家/);
  assert.match(systemPrompt, /严格 JSON/);
  assert.match(systemPrompt, /imagePrompt 必须用英文/);
  assert.match(systemPrompt, /具体生活动作/);
  assert.match(systemPrompt, /画面叙事/);
  assert.match(systemPrompt, /难忘回忆/);
  assert.match(systemPrompt, /情感递进/);
  assert.match(systemPrompt, /关系变化/);
  assert.match(systemPrompt, /全年龄/);
  assert.doesNotMatch(systemPrompt, /故事描述：/);
  assert.doesNotMatch(systemPrompt, /3-8岁/);
  assert.doesNotMatch(systemPrompt, /儿童绘本/);
});

test("buildStoryUserPrompt contains dynamic request inputs only", () => {
  const userPrompt = buildStoryUserPrompt({
    description: "一个孩子在月亮上找到了会发光的种子",
    photoUsage: "character",
    style: "watercolor",
    referenceCount: 3,
    pageCount: 8,
    language: "zh",
  });

  assert.match(userPrompt, /故事描述：一个孩子在月亮上找到了会发光的种子/);
  assert.match(userPrompt, /绘本风格：watercolor/);
  assert.match(userPrompt, /页数：8页/);
  assert.match(userPrompt, /必须刚好返回 8 个 pages 项/);
  assert.match(userPrompt, /每一页都要推进故事/);
  assert.match(userPrompt, /记忆锚点/);
  assert.match(userPrompt, /情绪递进/);
  assert.match(userPrompt, /关系变化/);
  assert.match(userPrompt, /不要把用户描述改写成泛泛的漂亮场景/);
  assert.match(userPrompt, /用户上传了3张照片作为故事主角的外貌参考/);
  assert.match(userPrompt, /参考照片中的人物是主角身份的最高优先级/);
  assert.match(userPrompt, /不要凭空把参考主角改成小孩、女孩、老人或其他性别年龄身份/);
  assert.match(userPrompt, /the main character from the uploaded reference photo/);
  assert.match(userPrompt, /用中文写故事/);
  assert.doesNotMatch(userPrompt, /只返回JSON/);
  assert.doesNotMatch(userPrompt, /儿童绘本/);
});

test("buildStoryUserPrompt includes explicit reference character context", () => {
  const userPrompt = buildStoryUserPrompt({
    description: "爸爸带小宇第一次去海边",
    photoUsage: "character",
    style: "watercolor",
    referenceCount: 2,
    pageCount: 4,
    language: "zh",
    referenceCharacterPrompt:
      "角色设定：参考图 1 = 爸爸；参考图 2 = 小宇。爸爸和小宇是父子。",
  });

  assert.match(userPrompt, /角色设定：参考图 1 = 爸爸/);
  assert.match(userPrompt, /爸爸和小宇是父子/);
});
