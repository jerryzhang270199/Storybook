import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_GENERATION_JOB_STATUSES,
  GENERATION_JOB_STATUS,
  parseStoredReferenceImages,
} from "./generation-job";

test("generation job active statuses exclude terminal states", () => {
  assert.equal(ACTIVE_GENERATION_JOB_STATUSES.includes(GENERATION_JOB_STATUS.completed), false);
  assert.equal(ACTIVE_GENERATION_JOB_STATUSES.includes(GENERATION_JOB_STATUS.failed), false);
  assert.equal(ACTIVE_GENERATION_JOB_STATUSES.includes(GENERATION_JOB_STATUS.generatingImages), true);
  assert.equal(ACTIVE_GENERATION_JOB_STATUSES.includes(GENERATION_JOB_STATUS.generatingAudio), true);
});

test("parseStoredReferenceImages validates stored reference metadata", () => {
  assert.deepEqual(
    parseStoredReferenceImages([
      {
        filename: "photo-1.jpg",
        mediaType: "image/jpeg",
        url: "/uploads/photo-1.jpg",
        character: {
          referenceIndex: 1,
          roleLabel: "爸爸",
          nickname: "爸爸",
          isPrimary: false,
          relationshipNote: "爸爸和小宇是父子",
        },
      },
    ]),
    [
      {
        filename: "photo-1.jpg",
        mediaType: "image/jpeg",
        url: "/uploads/photo-1.jpg",
        character: {
          referenceIndex: 1,
          roleLabel: "爸爸",
          nickname: "爸爸",
          isPrimary: false,
          relationshipNote: "爸爸和小宇是父子",
        },
      },
    ],
  );

  assert.throws(() => parseStoredReferenceImages([{ url: "/uploads/photo-1.jpg" }]), /Invalid/);
  assert.throws(() => parseStoredReferenceImages("not-json"), /Invalid/);
});
