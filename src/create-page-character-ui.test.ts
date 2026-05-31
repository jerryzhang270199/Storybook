import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("create page keeps role labeling low-friction after photo upload", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /这是谁/);
  assert.match(source, /怎么称呼/);
  assert.match(source, /谁是主角/);
  assert.match(source, /referenceCharacters/);
  assert.match(source, /REFERENCE_CHARACTER_ROLE_OPTIONS/);
});

test("create page keeps identity relation separate from nickname input", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.doesNotMatch(source, /roleLabel,\s+nickname:/);
  assert.match(source, /nickname: photo\.nickname\.trim\(\)/);
});

test("create page lets users type a custom relationship label inline", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /isCustomRole/);
  assert.match(source, /输入身份关系/);
  assert.match(source, /roleLabel: event\.target\.value/);
  assert.doesNotMatch(source, /自定义角色/);
});

test("create page avoids duplicate relationship explanation under primary picker", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.doesNotMatch(source, /relationshipNote/);
  assert.doesNotMatch(source, /需要的话补一句关系/);
  assert.doesNotMatch(source, /我会按这个理解/);
});

test("create page does not include hosted donation credit UI in the local template", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.doesNotMatch(source, /donation/i);
  assert.doesNotMatch(source, /赞助/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_DONATION/);
  assert.doesNotMatch(source, /\/api\/donation-credits/);
});

test("create page handles local configuration errors with a direct setup hint", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /LOCAL_CONFIGURATION_REQUIRED/);
  assert.match(source, /本地配置还没完成/);
});

test("create page keeps only the submit button generating label while waiting", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /loading \? "生成中\.\.\." : "生成绘本"/);
  assert.doesNotMatch(source, /绘本生成中/);
  assert.doesNotMatch(source, /生成通常需要几十秒到几分钟/);
});

test("create page uses a Chinese failure prefix for generation errors", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /生成失败：/);
  assert.doesNotMatch(source, /生成失败:/);
});
