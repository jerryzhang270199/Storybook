import assert from "node:assert/strict";
import test from "node:test";

import { getGenerationErrorResponse } from "./generation-errors";

test("getGenerationErrorResponse identifies Doubao provider auth errors", () => {
  const response = getGenerationErrorResponse({
    status: 401,
    error: {
      type: "invalid_request_error",
      message: "Incorrect API key provided",
    },
  });

  assert.equal(response.status, 502);
  assert.match(response.error, /豆包认证失败/);
  assert.match(response.error, /DOUBAO_API_KEY/);
  assert.match(response.error, /DOUBAO_STORY_MODEL/);
  assert.match(response.error, /DOUBAO_IMAGE_MODEL/);
});

test("getGenerationErrorResponse identifies missing Doubao configuration", () => {
  const response = getGenerationErrorResponse(
    new Error("DOUBAO_API_KEY and DOUBAO_IMAGE_MODEL must be set"),
  );

  assert.equal(response.status, 500);
  assert.match(response.error, /本地豆包配置缺失/);
  assert.match(response.error, /DOUBAO_API_KEY/);
  assert.match(response.error, /DOUBAO_STORY_MODEL/);
  assert.match(response.error, /DOUBAO_IMAGE_MODEL/);
  assert.match(response.error, /npm run doctor/);
});

test("getGenerationErrorResponse identifies Doubao image size configuration errors", () => {
  const response = getGenerationErrorResponse(
    new Error("400 The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels."),
  );

  assert.equal(response.status, 502);
  assert.match(response.error, /图片尺寸配置不兼容/);
  assert.match(response.error, /DOUBAO_IMAGE_SIZE=2K/);
  assert.match(response.error, /DOUBAO_IMAGE_MODEL/);
});

test("getGenerationErrorResponse identifies story JSON formatting failures", () => {
  const error = new Error("Story response was not valid JSON.");
  error.name = "StoryJsonParseError";

  const response = getGenerationErrorResponse(error);

  assert.equal(response.status, 502);
  assert.match(response.error, /故事生成返回格式异常/);
  assert.match(response.error, /DOUBAO_STORY_MODEL/);
});

test("getGenerationErrorResponse identifies temporary provider outages", () => {
  const response = getGenerationErrorResponse({
    status: 503,
    error: {
      error: {
        type: "bad_response_status_code",
        message:
          "Service temporarily unavailable after multiple retries, please try again later (request id: 20260523144927400146756Q0u67QQo)",
      },
    },
  });

  assert.equal(response.status, 503);
  assert.match(response.error, /豆包服务暂时不可用或请求超时/);
  assert.match(response.error, /DOUBAO_STORY_TIMEOUT_MS/);
  assert.match(response.error, /DOUBAO_IMAGE_TIMEOUT_MS/);
});

test("getGenerationErrorResponse identifies provider network connection failures", () => {
  const response = getGenerationErrorResponse(
    Object.assign(new Error("Connection error."), {
      cause: new TypeError("fetch failed"),
    }),
  );

  assert.equal(response.status, 503);
  assert.match(response.error, /豆包网络连接失败/);
  assert.match(response.error, /火山方舟/);
  assert.match(response.error, /IPv6/);
});

test("getGenerationErrorResponse identifies provider quota and billing errors", () => {
  const response = getGenerationErrorResponse(new Error("billing quota exceeded"));

  assert.equal(response.status, 402);
  assert.match(response.error, /豆包账户额度不足或计费未开启/);
  assert.match(response.error, /火山控制台/);
});

test("getGenerationErrorResponse identifies provider rate limits", () => {
  const response = getGenerationErrorResponse({ status: 429, error: { message: "rate limit" } });

  assert.equal(response.status, 429);
  assert.match(response.error, /豆包请求过于频繁/);
  assert.match(response.error, /稍后重试/);
});

test("getGenerationErrorResponse keeps unknown errors generic", () => {
  const response = getGenerationErrorResponse(new Error("boom"));

  assert.equal(response.status, 500);
  assert.equal(response.error, "生成失败：暂时无法判断具体原因。请查看终端日志中的 [generation-job] failed 记录，然后重试。");
});
