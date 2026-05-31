import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("create page voice cards hide provider voice names from users", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.doesNotMatch(source, /voice\.providerName/);
  assert.match(source, /voice\.label/);
  assert.doesNotMatch(source, /voice\.description/);
});

test("create page voice cards fit the four choices in one desktop row", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.doesNotMatch(source, /min-h-24/);
  assert.match(source, /grid grid-cols-2 md:grid-cols-4 gap-3/);
});
