import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGeneratedStoryPageCount,
  parseGeneratedStory,
  StoryJsonParseError,
} from "./story-parser";

test("parseGeneratedStory parses fenced JSON", () => {
  const story = parseGeneratedStory(`\`\`\`json
{
  "title": "测试故事",
  "pages": [
    { "text": "第一页", "imagePrompt": "A sunny park" }
  ]
}
\`\`\``);

  assert.equal(story.title, "测试故事");
  assert.equal(story.pages[0].imagePrompt, "A sunny park");
});

test("parseGeneratedStory repairs common malformed JSON from model output", () => {
  const story = parseGeneratedStory(`{
    title: "测试故事",
    pages: [
      { text: "第一页", imagePrompt: "A child says "hello" in a sunny park", },
    ],
  }`);

  assert.equal(story.title, "测试故事");
  assert.match(story.pages[0].imagePrompt, /hello/);
});

test("parseGeneratedStory throws a diagnostic error for unrecoverable output", () => {
  assert.throws(
    () => parseGeneratedStory("not json at all"),
    (error) => error instanceof StoryJsonParseError && error.rawText === "not json at all",
  );
});

test("normalizeGeneratedStoryPageCount trims extra model pages to the requested count", () => {
  const story = normalizeGeneratedStoryPageCount(
    {
      title: "四页故事",
      pages: [
        { text: "1", imagePrompt: "one" },
        { text: "2", imagePrompt: "two" },
        { text: "3", imagePrompt: "three" },
        { text: "4", imagePrompt: "four" },
        { text: "5", imagePrompt: "five" },
      ],
    },
    4,
  );

  assert.equal(story.pages.length, 4);
  assert.equal(story.pages.at(-1)?.text, "4");
});

test("normalizeGeneratedStoryPageCount pads missing pages from the final page", () => {
  const story = normalizeGeneratedStoryPageCount(
    {
      title: "四页故事",
      pages: [
        { text: "1", imagePrompt: "one" },
        { text: "2", imagePrompt: "two" },
      ],
    },
    4,
  );

  assert.equal(story.pages.length, 4);
  assert.equal(story.pages[2].text, "四页故事");
  assert.match(story.pages[2].imagePrompt, /gentle closing illustration/);
});
