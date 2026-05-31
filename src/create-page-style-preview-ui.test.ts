import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("create page renders a preview image for each story style", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /s\.thumbnailUrl/);
  assert.match(source, /\$\{s\.name\} 风格示例/);
  assert.match(source, /min-h-\[80px\]/);
  assert.match(source, /items-center justify-center text-center/);
  assert.match(source, /font-medium/);
  assert.match(source, /h-12 w-12/);
  assert.match(source, /sizes="56px"/);
});
