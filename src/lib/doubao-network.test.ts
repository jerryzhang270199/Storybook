import assert from "node:assert/strict";
import test from "node:test";

import {
  isDoubaoConnectionError,
  withDoubaoConnectionRetry,
} from "./doubao-network";

test("isDoubaoConnectionError recognizes OpenAI SDK fetch failures", () => {
  const error = Object.assign(new Error("Connection error."), {
    cause: new TypeError("fetch failed"),
  });

  assert.equal(isDoubaoConnectionError(error), true);
});

test("withDoubaoConnectionRetry retries once with ipv6first DNS order", async () => {
  const orders: string[] = [];
  let attempts = 0;

  const result = await withDoubaoConnectionRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("Connection error."), {
          cause: new TypeError("fetch failed"),
        });
      }
      return "ok";
    },
    {
      getDefaultResultOrder: () => "verbatim",
      logWarning: () => undefined,
      setDefaultResultOrder: (order) => {
        orders.push(order);
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(orders, ["ipv6first"]);
});

test("withDoubaoConnectionRetry retries transient failures when already using ipv6first", async () => {
  let attempts = 0;

  const result = await withDoubaoConnectionRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("fetch failed"), {
          cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
        });
      }
      return "ok";
    },
    {
      getDefaultResultOrder: () => "ipv6first",
      logWarning: () => undefined,
      setDefaultResultOrder: () => {
        throw new Error("should not reset dns order");
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("withDoubaoConnectionRetry spaces out repeated transient retries", async () => {
  const delays: number[] = [];
  let attempts = 0;

  const result = await withDoubaoConnectionRetry(
    async () => {
      attempts += 1;
      if (attempts < 4) {
        throw Object.assign(new Error("Connection error."), {
          cause: new TypeError("fetch failed"),
        });
      }
      return "ok";
    },
    {
      delay: async (durationMs) => {
        delays.push(durationMs);
      },
      getDefaultResultOrder: () => "ipv6first",
      logWarning: () => undefined,
      setDefaultResultOrder: () => {
        throw new Error("should not reset dns order");
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [500, 1000, 1500]);
});

test("withDoubaoConnectionRetry does not retry non-network provider errors", async () => {
  let attempts = 0;

  await assert.rejects(
    withDoubaoConnectionRetry(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("Incorrect API key provided"), { status: 401 });
      },
      {
        getDefaultResultOrder: () => "verbatim",
        logWarning: () => undefined,
        setDefaultResultOrder: () => {
          throw new Error("should not set dns order");
        },
      },
    ),
    /Incorrect API key/,
  );

  assert.equal(attempts, 1);
});
