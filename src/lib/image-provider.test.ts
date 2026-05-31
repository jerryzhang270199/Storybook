import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDoubaoImageProviderConfig } from "./image-provider";

test("getDoubaoImageProviderConfig is disabled until key and model are configured", () => {
  assert.equal(getDoubaoImageProviderConfig({}), null);
  assert.equal(getDoubaoImageProviderConfig({ DOUBAO_API_KEY: "doubao-key" }), null);
  assert.equal(getDoubaoImageProviderConfig({ DOUBAO_IMAGE_MODEL: "seedream-endpoint" }), null);
});

test("getDoubaoImageProviderConfig reads Ark-compatible defaults", () => {
  const config = getDoubaoImageProviderConfig({
    DOUBAO_API_KEY: "doubao-key",
    DOUBAO_IMAGE_MODEL: "seedream-endpoint",
  });

  assert.deepEqual(config, {
    apiKey: "doubao-key",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    model: "seedream-endpoint",
  });
});

test("getDoubaoImageProviderConfig allows Ark endpoint aliases", () => {
  const config = getDoubaoImageProviderConfig({
    ARK_API_KEY: "ark-key",
    ARK_BASE_URL: "https://ark.example/api/v3/",
    DOUBAO_IMAGE_MODEL: "seedream-endpoint",
  });

  assert.deepEqual(config, {
    apiKey: "ark-key",
    baseURL: "https://ark.example/api/v3",
    model: "seedream-endpoint",
  });
});

test("image provider module exposes only Doubao configuration for the local template", async () => {
  const source = await readFile("src/lib/image-provider.ts", "utf8");

  assert.doesNotMatch(source, /packy/i);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
});
