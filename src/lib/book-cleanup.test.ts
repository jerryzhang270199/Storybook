import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBookImageUrlsForDeletion,
  shouldDeleteReferenceImagesAfterSuccess,
} from "./book-cleanup";

test("shouldDeleteReferenceImagesAfterSuccess defaults to deleting source references", () => {
  assert.equal(shouldDeleteReferenceImagesAfterSuccess({}), true);
  assert.equal(
    shouldDeleteReferenceImagesAfterSuccess({ KEEP_REFERENCE_IMAGES_AFTER_GENERATION: "true" }),
    false,
  );
});

test("collectBookImageUrlsForDeletion returns unique stored book image urls", () => {
  const urls = collectBookImageUrlsForDeletion({
    photoUrl: "/uploads/reference-1.png",
    pages: [
      { imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3" },
      { imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3" },
      { imageUrl: "/uploads/page-2.png", audioUrl: "/uploads/audio-2.mp3" },
    ],
    generationJob: {
      referenceImages: [
        {
          filename: "reference-1.png",
          mediaType: "image/png",
          url: "/uploads/reference-1.png",
        },
        {
          filename: "reference-2.jpg",
          mediaType: "image/jpeg",
          url: "/uploads/reference-2.jpg",
        },
      ],
    },
  });

  assert.deepEqual(urls, [
    "/uploads/reference-1.png",
    "/uploads/page-1.png",
    "/uploads/audio-1.mp3",
    "/uploads/page-2.png",
    "/uploads/audio-2.mp3",
    "/uploads/reference-2.jpg",
  ]);
});

test("collectBookImageUrlsForDeletion ignores invalid stored reference metadata", () => {
  const urls = collectBookImageUrlsForDeletion({
    photoUrl: null,
    pages: [{ imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3" }],
    generationJob: { referenceImages: "bad-reference-json" },
  });

  assert.deepEqual(urls, ["/uploads/page-1.png", "/uploads/audio-1.mp3"]);
});
