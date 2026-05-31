import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDoubaoImageGenerateBody,
  buildStyledImagePrompt,
  extractImageResponseBase64,
  getImageEditReferences,
  getDoubaoImageSize,
  type ImageReference,
} from "./image-generation";

const one: ImageReference = {
  buffer: Buffer.from("one"),
  filename: "one.png",
  mediaType: "image/png",
};

const two: ImageReference = {
  buffer: Buffer.from("two"),
  filename: "two.jpg",
  mediaType: "image/jpeg",
};

test("getImageEditReferences prefers the multi-image reference list", () => {
  assert.deepEqual(
    getImageEditReferences({
      referenceImage: one,
      referenceImages: [one, two],
    }),
    [one, two],
  );
});

test("getImageEditReferences preserves legacy single-image references", () => {
  assert.deepEqual(getImageEditReferences({ referenceImage: one }), [one]);
  assert.deepEqual(getImageEditReferences({}), []);
});

test("buildStyledImagePrompt emphasizes the selected style contract", () => {
  const prompt = buildStyledImagePrompt({
    prompt: "A moonlit garden with a tiny glowing seed",
    style: "Strict watercolor style contract",
    referenceMode: "inspiration",
    hasReferenceImages: true,
  });

  assert.match(prompt, /Follow this visual style contract exactly/i);
  assert.match(prompt, /selected style dominate/i);
  assert.match(prompt, /picture book illustration/);
  assert.match(prompt, /clear story beat/i);
  assert.match(prompt, /remembered moment/i);
  assert.match(prompt, /emotional relationship/i);
  assert.match(prompt, /visual inspiration/);
  assert.doesNotMatch(prompt, /vibrant colors, friendly and warm atmosphere/i);
  assert.doesNotMatch(prompt, /children's book/i);
  assert.doesNotMatch(prompt, /child-safe/i);
});

test("buildStyledImagePrompt asks the image model to render page text", () => {
  const prompt = buildStyledImagePrompt({
    prompt: "A sunny classroom scene",
    style: "watercolor",
    referenceMode: "character",
    hasReferenceImages: true,
    pageText: "阳光初照的清晨，小宇坐在窗前书桌前",
  });

  assert.match(prompt, /render this exact Chinese page text/i);
  assert.match(prompt, /阳光初照的清晨，小宇坐在窗前书桌前/);
  assert.match(prompt, /Do not add extra words or random symbols/);
});

test("buildStyledImagePrompt treats character references as identity source of truth", () => {
  const prompt = buildStyledImagePrompt({
    prompt: "A cute little girl reads a book in bed",
    style: "cartoon",
    referenceMode: "character",
    hasReferenceImages: true,
  });

  assert.match(prompt, /uploaded reference image is the identity source of truth/i);
  assert.match(prompt, /Do not transform the referenced person into a child, girl, boy, older person, or different gender/i);
  assert.match(prompt, /ignore the conflicting invented identity/i);
});

test("buildStyledImagePrompt includes explicit reference character mapping", () => {
  const prompt = buildStyledImagePrompt({
    prompt: "A father and child cook dinner together",
    style: "watercolor",
    referenceMode: "character",
    hasReferenceImages: true,
    referenceCharacterPrompt:
      "Character reference mapping: Reference image 1 is 爸爸. Reference image 2 is 小宇.",
  });

  assert.match(prompt, /Reference image 1 is 爸爸/);
  assert.match(prompt, /Reference image 2 is 小宇/);
  assert.match(prompt, /uploaded reference image is the identity source of truth/i);
});

test("extractImageResponseBase64 accepts provider base64 image responses", async () => {
  const base64 = await extractImageResponseBase64({
    data: [{ b64_json: "image-base64" }],
  });

  assert.equal(base64, "image-base64");
});

test("extractImageResponseBase64 accepts provider data URL image responses", async () => {
  const base64 = await extractImageResponseBase64({
    data: [{ url: "data:image/png;base64,image-base64" }],
  });

  assert.equal(base64, "image-base64");
});

test("getDoubaoImageSize uses a Seedream 5 canvas that satisfies provider minimums", () => {
  assert.equal(getDoubaoImageSize("doubao-seedream-5-0-260128"), "2K");
  assert.equal(getDoubaoImageSize("doubao-seedream-4-0-250828"), "1024x1024");
});

test("getDoubaoImageSize allows an explicit env size override", () => {
  assert.equal(
    getDoubaoImageSize("doubao-seedream-5-0-260128", {
      DOUBAO_IMAGE_SIZE: "2048x2048",
    }),
    "2048x2048",
  );
});

test("getDoubaoImageSize ignores Seedream 5 overrides below the provider pixel minimum", () => {
  assert.equal(
    getDoubaoImageSize("doubao-seedream-5-0-260128", {
      DOUBAO_IMAGE_SIZE: "1536x1536",
    }),
    "2K",
  );
  assert.equal(
    getDoubaoImageSize("doubao-seedream-5-0-260128", {
      DOUBAO_IMAGE_SIZE: "1024x1024",
    }),
    "2K",
  );
  assert.equal(
    getDoubaoImageSize("doubao-seedream-4-0-250828", {
      DOUBAO_IMAGE_SIZE: "1536x1536",
    }),
    "1536x1536",
  );
});

test("buildDoubaoImageGenerateBody sends uploaded references as image data URLs", () => {
  const body = buildDoubaoImageGenerateBody({
    model: "doubao-seedream-5-0-260128",
    prompt: "A warm family portrait",
    referenceImages: [one, two],
    referenceMode: "character",
    style: "watercolor",
  });

  assert.equal(body.model, "doubao-seedream-5-0-260128");
  assert.equal(body.size, "2K");
  assert.equal(Array.isArray(body.image), true);
  assert.deepEqual(body.image, [
    `data:image/png;base64,${one.buffer.toString("base64")}`,
    `data:image/jpeg;base64,${two.buffer.toString("base64")}`,
  ]);
  assert.match(body.prompt, /character appearance references/);
});
