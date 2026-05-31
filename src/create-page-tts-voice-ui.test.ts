import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("create page renders an avatar for each TTS voice option", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /voice\.avatarUrl/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /alt=""/);
});

test("create page voice cards place text before a compact trailing avatar", async () => {
  const source = await readFile("src/app/create/page.tsx", "utf8");

  assert.match(source, /justify-between/);
  assert.match(source, /<span>\{voice\.label\}<\/span>/);
  assert.match(source, /src=\{voice\.avatarUrl\}/);
  assert.equal(source.indexOf("<span>{voice.label}</span>") < source.indexOf("src={voice.avatarUrl}"), true);
  assert.match(source, /h-9 w-9/);
  assert.doesNotMatch(source, /min-h-28 flex-col/);
  assert.doesNotMatch(source, /h-14 w-14/);
});
