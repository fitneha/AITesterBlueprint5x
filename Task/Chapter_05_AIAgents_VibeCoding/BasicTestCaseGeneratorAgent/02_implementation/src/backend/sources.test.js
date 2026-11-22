import test from "node:test";
import assert from "node:assert/strict";
import { collectSources } from "./sources.js";

test("duplicate source content is compacted without losing source provenance", async () => {
  const sourceText = "The dashboard must load after valid sign in.";
  const result = await collectSources({
    manualText: sourceText,
    files: [{
      originalname: "requirements.txt",
      size: Buffer.byteLength(sourceText),
      buffer: Buffer.from(sourceText)
    }]
  }, {
    maxUploadBytes: 1024,
    jira: { missing: [] }
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].sourceIds.length, 2);
  assert.equal(result.sources[0].alsoFrom[0].title, "requirements.txt");
  assert.match(result.warnings[0], /Duplicate source content/);
});

test("combined source content is bounded with an explicit error", async () => {
  const sourceText = "x".repeat(50001);
  await assert.rejects(() => collectSources({
    manualText: sourceText,
    files: [{
      originalname: "requirements.txt",
      size: Buffer.byteLength(sourceText),
      buffer: Buffer.from(sourceText)
    }]
  }, { maxUploadBytes: 100000, jira: { missing: [] } }), /50,000 character limit/);
});
