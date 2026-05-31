import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDoubaoStoryProviderConfig } from "./story-provider";

test("getDoubaoStoryProviderConfig is disabled until key and model are configured", () => {
  assert.equal(getDoubaoStoryProviderConfig({}), null);
  assert.equal(getDoubaoStoryProviderConfig({ DOUBAO_API_KEY: "doubao-key" }), null);
  assert.equal(getDoubaoStoryProviderConfig({ DOUBAO_STORY_MODEL: "doubao-endpoint-id" }), null);
});

test("getDoubaoStoryProviderConfig reads Ark-compatible defaults", () => {
  const config = getDoubaoStoryProviderConfig({
    DOUBAO_API_KEY: "doubao-key",
    DOUBAO_STORY_MODEL: "doubao-endpoint-id",
  });

  assert.deepEqual(config, {
    apiKey: "doubao-key",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-endpoint-id",
  });
});

test("getDoubaoStoryProviderConfig allows Ark endpoint and model aliases", () => {
  const config = getDoubaoStoryProviderConfig({
    ARK_API_KEY: "ark-key",
    ARK_BASE_URL: "https://ark.example/api/v3/",
    DOUBAO_TEXT_MODEL: "text-endpoint",
  });

  assert.deepEqual(config, {
    apiKey: "ark-key",
    baseURL: "https://ark.example/api/v3",
    model: "text-endpoint",
  });
});

test("story provider module exposes only Doubao configuration for the local template", async () => {
  const source = await readFile("src/lib/story-provider.ts", "utf8");

  assert.doesNotMatch(source, /packy/i);
  assert.doesNotMatch(source, /anthropic/i);
  assert.doesNotMatch(source, /claude/i);
});
