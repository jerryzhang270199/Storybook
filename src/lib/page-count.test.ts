import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PAGE_COUNT,
  MAX_PAGE_COUNT,
  MIN_PAGE_COUNT,
  parsePageCount,
} from "./page-count";

test("parsePageCount defaults to four pages when no value is provided", () => {
  assert.equal(DEFAULT_PAGE_COUNT, 4);
  assert.equal(MIN_PAGE_COUNT, 1);
  assert.equal(MAX_PAGE_COUNT, 9);
  assert.equal(parsePageCount(null), 4);
  assert.equal(parsePageCount(undefined), 4);
  assert.equal(parsePageCount(""), 4);
});

test("parsePageCount accepts integer page counts from one to nine", () => {
  assert.equal(parsePageCount("1"), 1);
  assert.equal(parsePageCount("2"), 2);
  assert.equal(parsePageCount("3"), 3);
  assert.equal(parsePageCount("4"), 4);
  assert.equal(parsePageCount("5"), 5);
  assert.equal(parsePageCount("6"), 6);
  assert.equal(parsePageCount("7"), 7);
  assert.equal(parsePageCount("8"), 8);
  assert.equal(parsePageCount("9"), 9);

  assert.throws(() => parsePageCount("0"), /integer from 1 to 9/);
  assert.throws(() => parsePageCount("10"), /integer from 1 to 9/);
  assert.throws(() => parsePageCount("4.5"), /integer from 1 to 9/);
  assert.throws(() => parsePageCount("abc"), /integer from 1 to 9/);
});
