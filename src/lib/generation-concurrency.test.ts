import assert from "node:assert/strict";
import test from "node:test";

import { getPerBookImageConcurrencyLimit } from "./generation-concurrency";

test("getPerBookImageConcurrencyLimit defaults to sequential image generation", () => {
  assert.equal(getPerBookImageConcurrencyLimit({}), 1);
});

test("getPerBookImageConcurrencyLimit accepts only positive integer overrides", () => {
  assert.equal(getPerBookImageConcurrencyLimit({ PER_BOOK_IMAGE_CONCURRENCY: "2" }), 2);
  assert.equal(getPerBookImageConcurrencyLimit({ PER_BOOK_IMAGE_CONCURRENCY: "0" }), 1);
  assert.equal(getPerBookImageConcurrencyLimit({ PER_BOOK_IMAGE_CONCURRENCY: "bad" }), 1);
});
