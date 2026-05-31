import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationStageTimer,
  generatePageImagesInBatches,
  shouldPrewarmBookVideoCache,
  startPageAudioGeneration,
} from "./generation-runner";

test("createGenerationStageTimer logs stage and total durations", () => {
  let now = 1_000;
  const logs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const timer = createGenerationStageTimer({
    jobId: "job-1",
    log: (message, payload) => logs.push({ message, payload }),
    now: () => now,
  });

  const stageStartedAt = timer.startStage();
  now = 1_375;
  timer.logStageCompleted("story", stageStartedAt, { pageCount: 4 });

  assert.deepEqual(logs, [
    {
      message: "[generation-job] stage completed",
      payload: {
        durationMs: 375,
        jobId: "job-1",
        pageCount: 4,
        stage: "story",
        totalElapsedMs: 375,
      },
    },
  ]);
});

test("audio generation can start before image batches finish", async () => {
  const events: string[] = [];
  let resolveImages: () => void = () => {};
  const imageGate = new Promise<void>((resolve) => {
    resolveImages = resolve;
  });

  const audioPromise = startPageAudioGeneration({
    generateAudioUrls: async () => {
      events.push("audio-started");
      return ["audio-1", "audio-2"];
    },
    onCompleted: () => events.push("audio-completed"),
    onStarted: () => events.push("audio-stage-started"),
    pages: [{ text: "one" }, { text: "two" }],
  });

  const imagePromise = generatePageImagesInBatches({
    batchSize: 2,
    generatePageImage: async (_page, index) => {
      events.push(`image-${index + 1}-started`);
      await imageGate;
      return `image-data-${index + 1}`;
    },
    onBatchCompleted: () => events.push("image-batch-completed"),
    onBatchStarted: () => events.push("image-batch-started"),
    pages: [
      { imagePrompt: "image one", text: "one" },
      { imagePrompt: "image two", text: "two" },
    ],
    savePageImage: async (imageBase64, index) => `image-url-${index + 1}-${imageBase64}`,
  });

  await audioPromise;
  assert.deepEqual(events.slice(0, 4), [
    "audio-stage-started",
    "audio-started",
    "image-batch-started",
    "image-1-started",
  ]);

  resolveImages();
  const imageResult = await imagePromise;
  assert.deepEqual(imageResult.pageImages, [
    "image-url-1-image-data-1",
    "image-url-2-image-data-2",
  ]);
  assert.equal(events.includes("audio-completed"), true);
  assert.equal(events.includes("image-batch-completed"), true);
});

test("book video cache prewarms only when generated pages have narration audio", () => {
  assert.equal(
    shouldPrewarmBookVideoCache([
      { audioUrl: "/uploads/audio-1.mp3" },
      { audioUrl: "/uploads/audio-2.mp3" },
    ]),
    true,
  );
  assert.equal(
    shouldPrewarmBookVideoCache([
      { audioUrl: "/uploads/audio-1.mp3" },
      { audioUrl: null },
    ]),
    false,
  );
  assert.equal(shouldPrewarmBookVideoCache([]), false);
});
