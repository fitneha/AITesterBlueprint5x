import test from "node:test";
import assert from "node:assert/strict";
import { callModel, ModelError, testModelConnection } from "./model.js";

function rateLimitResponse(body, retryAfter = "3") {
  return {
    ok: false,
    status: 429,
    headers: new Headers({ "retry-after": retryAfter }),
    json: async () => body
  };
}

test("Groq rate limits surface provider guidance and retry timing", async () => {
  const provider = { provider: "groq", apiKey: "test-key", model: "test-model" };
  await assert.rejects(
    () => callModel([], provider, async () => rateLimitResponse({
      error: { message: "Rate limit reached for requests." }
    })),
    (error) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.status, 429);
      assert.match(error.message, /rate limit or usage quota reached/i);
      assert.match(error.message, /Rate limit reached for requests/);
      assert.match(error.message, /Retry after 3 seconds/);
      assert.match(error.message, /Check Groq rate limits and account quota/);
      return true;
    }
  );
});

test("model connection test gives actionable guidance when the provider is rate limited", async () => {
  const provider = { provider: "groq", apiKey: "test-key", model: "test-model" };
  await assert.rejects(
    () => testModelConnection(provider, async () => rateLimitResponse(null, "")),
    (error) => {
      assert.equal(error.status, 429);
      assert.match(error.message, /Groq rate limit or usage quota reached/);
      assert.match(error.message, /Check Groq rate limits and account quota/);
      return true;
    }
  );
});
