import test from "node:test";
import assert from "node:assert/strict";
import { fetchJiraSources, toPlainText, validateIssueKey } from "./jira.js";

const config = {
  jira: {
    baseUrl: "https://jira.example",
    email: "qa@example.com",
    token: "secret",
    missing: []
  }
};

test("issue keys and Jira document-format text are normalized", () => {
  assert.equal(validateIssueKey("QA-12"), true);
  assert.equal(validateIssueKey("QA bad"), false);
  assert.equal(toPlainText({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Acceptance criteria" }] }]
  }), "Acceptance criteria");
});

test("Jira retrieval discovers the acceptance-criteria field by name", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname.endsWith("/field")) {
      return { ok: true, json: async () => [{ id: "customfield_11223", name: "Acceptance Criteria" }] };
    }
    if (url.pathname.endsWith("/comment")) {
      return { ok: true, json: async () => ({ comments: [{ body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Clarified by Product" }] }] } }] }) };
    }
    return {
      ok: true,
      json: async () => ({
        key: "QA-12",
        fields: {
          summary: "Login validation",
          issuetype: { name: "Story" },
          description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Login with valid credentials" }] }] },
          customfield_11223: "Show an error for invalid credentials"
        }
      })
    };
  };

  const result = await fetchJiraSources(["QA-12"], config, fetchImpl);
  assert.equal(result.sources[0].acceptanceCriteria, "Show an error for invalid credentials");
  assert.equal(result.sources[0].comments[0], "Clarified by Product");
  assert.match(result.sources[0].text, /Login with valid credentials/);
  assert.match(result.sources[0].text, /Show an error for invalid credentials/);
  assert.ok(calls.some((path) => path.endsWith("/field")));
});

test("inaccessible Jira issues fail visibly", async () => {
  const fetchImpl = async (input) => {
    if (String(input).includes("/field")) return { ok: true, json: async () => [] };
    return { status: 403, ok: false };
  };
  await assert.rejects(() => fetchJiraSources(["QA-12"], config, fetchImpl), /denied|lacks access/);
});
