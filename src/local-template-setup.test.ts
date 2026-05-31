import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLocalEnvContent,
  getEmptyRequiredLocalValues,
} from "../scripts/init-local";

test("package scripts expose a one-command local setup path", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    bugs?: { url?: string };
    engines?: Record<string, string>;
    homepage?: string;
    license?: string;
    packageManager?: string;
    private?: boolean;
    repository?: { type?: string; url?: string };
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.engines?.node, ">=24.0.0");
  assert.match(packageJson.packageManager ?? "", /^npm@/);
  assert.match(packageJson.repository?.url ?? "", /github\.com/);
  assert.match(packageJson.bugs?.url ?? "", /issues$/);
  assert.match(packageJson.homepage ?? "", /#readme$/);
  assert.equal(packageJson.scripts?.["db:up"], "docker compose up -d");
  assert.equal(packageJson.scripts?.["init:local"], "tsx scripts/init-local.ts");
  assert.equal(packageJson.scripts?.["doctor:doubao"], "tsx scripts/check-doubao.ts");
  assert.equal(
    packageJson.scripts?.["setup:local"],
    "npm run doctor && npm run db:up && npm run db:setup",
  );
  assert.equal(packageJson.scripts?.["scan:template"], undefined);
  assert.equal(packageJson.scripts?.["vercel-build"], undefined);
  assert.equal(packageJson.dependencies?.["@vercel/blob"], undefined);
});

test("README documents the local setup commands", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /中文/);
  assert.match(readme, /README\.en\.md/);
  assert.match(readme, /npm run setup:local/);
  assert.match(readme, /npm run init:local/);
  assert.match(readme, /npm run doctor:doubao/);
  assert.match(readme, /docs\/doubao-setup\.zh-CN\.md/);
  assert.doesNotMatch(readme, /^## 配置说明/m);
  assert.doesNotMatch(readme, /^## 本地文件和数据/m);
  assert.doesNotMatch(readme, /^## 常见问题/m);
});

test("default README gives local users a complete first-run path", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /npm run init:local/);
  assert.match(readme, /DOUBAO_API_KEY/);
  assert.match(readme, /DOUBAO_STORY_MODEL/);
  assert.match(readme, /DOUBAO_IMAGE_MODEL/);
  assert.match(readme, /npm run doctor:doubao/);
  assert.match(readme, /docs\/doubao-setup\.zh-CN\.md/);
});

test("README stays concise and provider-neutral for the open-source template", async () => {
  const readme = await readFile("README.md", "utf8");
  const englishReadme = await readFile("README.en.md", "utf8");
  const envExample = await readFile(".env.example", "utf8");
  const nextConfig = await readFile("next.config.ts", "utf8");

  assert.doesNotMatch(readme, /^## 配置说明|^## 本地文件和数据|^## 常见问题/m);
  assert.doesNotMatch(englishReadme, /^## Configuration|^## Local Files and Data|^## Common Problems/m);
  assert.doesNotMatch(readme, /Vercel Blob/i);
  assert.doesNotMatch(englishReadme, /Vercel Blob/i);
  assert.match(readme, /<video src="https:\/\/github\.com\/user-attachments/);
  assert.match(readme, /^## 绘本预览/m);
  assert.match(englishReadme, /^## Demo Videos/m);
  assert.doesNotMatch(readme, /vercel\.app/);
  assert.doesNotMatch(englishReadme, /vercel\.app/);
  assert.doesNotMatch(envExample, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(nextConfig, /public\.blob\.vercel-storage\.com/);
  assert.doesNotMatch(nextConfig, /remotePatterns/);
});

test("open-source template does not ship provider-specific Vercel deployment files", async () => {
  await assert.rejects(access("vercel.json"));
  await assert.rejects(access(".vercelignore"));
});

test("CI does not carry hosted auth, email, or queue configuration", async () => {
  const ci = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(ci, /DATABASE_URL/);
  assert.doesNotMatch(ci, /AUTH_SECRET|AUTH_URL|NEXTAUTH|QSTASH|RESEND|PASSWORD_RESET/);
});

test("Doubao setup guide explains required model choices and common fixes", async () => {
  const guide = await readFile("docs/doubao-setup.zh-CN.md", "utf8");

  assert.match(guide, /火山引擎/);
  assert.match(guide, /方舟/);
  assert.match(guide, /DOUBAO_API_KEY/);
  assert.match(guide, /DOUBAO_STORY_MODEL/);
  assert.match(guide, /DOUBAO_IMAGE_MODEL/);
  assert.match(guide, /DOUBAO_IMAGE_SIZE=2K/);
  assert.match(guide, /--check-tts/);
  assert.match(guide, /401|认证失败/);
  assert.match(guide, /quota|额度|计费/);
});

test("docs directory contains only public user-facing guides", async () => {
  const entries = await readdir("docs", { withFileTypes: true });

  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    ["doubao-setup.zh-CN.md"],
  );
});

test("local init script copies the local env template without auth secrets", () => {
  const template = [
    'DATABASE_URL="postgresql://storybook:storybook@localhost:5432/storybook?schema=public"',
    'DOUBAO_API_KEY=""',
    'DOUBAO_STORY_MODEL=""',
    'DOUBAO_IMAGE_MODEL=""',
  ].join("\n");

  const envContent = buildLocalEnvContent(template);

  assert.match(envContent, /DATABASE_URL=/);
  assert.doesNotMatch(envContent, /AUTH_SECRET/);
});

test("local init script identifies Doubao values the user must fill", () => {
  const missing = getEmptyRequiredLocalValues([
    'DOUBAO_API_KEY=""',
    'DOUBAO_STORY_MODEL="ep-story"',
    'DOUBAO_IMAGE_MODEL=""',
  ].join("\n"));

  assert.deepEqual(missing, ["DOUBAO_API_KEY", "DOUBAO_IMAGE_MODEL"]);
});

test("open-source template does not ship unused framework starter svgs", async () => {
  const publicFiles = await readdir("public");

  assert.deepEqual(
    publicFiles.filter((file) =>
      ["file.svg", "globe.svg", "next.svg", "vercel.svg", "window.svg"].includes(file),
    ),
    [],
  );
});
