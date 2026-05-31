import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import {
  DEFAULT_STORY_STYLE_ID,
  STYLE_OPTIONS,
  parseStoryStyle,
} from "./story-styles";

test("story styles use watercolor as the stable default", () => {
  assert.equal(DEFAULT_STORY_STYLE_ID, "watercolor");
  assert.equal(parseStoryStyle(null).id, "watercolor");
  assert.equal(parseStoryStyle("").id, "watercolor");
});

test("story styles expose fewer visually distinct options", () => {
  assert.deepEqual(
    STYLE_OPTIONS.map((style) => style.id),
    ["watercolor", "cartoon", "comic_panel", "toy_3d"],
  );
  assert.equal(STYLE_OPTIONS.length, 4);
  assert.equal(STYLE_OPTIONS.some((style) => style.id === "flat"), false);
  assert.equal(STYLE_OPTIONS.some((style) => style.id === "crayon"), false);
});

test("story styles provide explicit visual contracts", () => {
  const watercolor = parseStoryStyle("watercolor");
  const cartoon = parseStoryStyle("cartoon");
  const comic = parseStoryStyle("comic_panel");
  const toy = parseStoryStyle("toy_3d");

  assert.match(watercolor.prompt, /Strict watercolor/i);
  assert.match(watercolor.prompt, /paper grain/i);
  assert.match(watercolor.prompt, /Avoid clean vector outlines/i);
  assert.match(cartoon.prompt, /Strict clean cartoon/i);
  assert.match(cartoon.prompt, /flat color blocks/i);
  assert.match(cartoon.prompt, /Avoid watercolor bleeding/i);
  assert.match(comic.prompt, /Strict comic panel/i);
  assert.match(comic.prompt, /2-3 distinct comic panels/i);
  assert.match(comic.prompt, /visible panel borders and gutters/i);
  assert.match(comic.prompt, /dynamic camera angles/i);
  assert.match(comic.prompt, /Avoid single full-page cartoon illustration/i);
  assert.match(toy.prompt, /Strict 3D toy storybook/i);
  assert.match(toy.prompt, /clay-like characters/i);
  assert.match(toy.prompt, /miniature diorama set/i);
  assert.match(toy.prompt, /Avoid flat 2D cartoon/i);
});

test("story styles expose local WebP preview thumbnails", async () => {
  for (const style of STYLE_OPTIONS) {
    const thumbnailUrl = (style as { thumbnailUrl?: string }).thumbnailUrl;
    const source = await readFile(`public${thumbnailUrl}`);
    const metadata = await sharp(source).metadata();

    assert.match(thumbnailUrl, /^\/style-previews\/[a-z0-9-]+\.webp$/);
    assert.equal(source.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(source.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(metadata.width, 448);
    assert.equal(metadata.height, 512);
    assert.ok(source.length > 20_000);
  }
});

test("story style parser maps deprecated styles to current presets", () => {
  assert.equal(parseStoryStyle("classic_storybook").id, "watercolor");
  assert.equal(parseStoryStyle("healing_handdrawn").id, "watercolor");
  assert.equal(parseStoryStyle("vintage_storybook").id, "watercolor");
});

test("story style parser rejects unsupported values", () => {
  assert.throws(() => parseStoryStyle("unknown-style"), /Unsupported story style/);
  assert.throws(() => parseStoryStyle(new File([], "style.txt")), /Unsupported story style/);
});
