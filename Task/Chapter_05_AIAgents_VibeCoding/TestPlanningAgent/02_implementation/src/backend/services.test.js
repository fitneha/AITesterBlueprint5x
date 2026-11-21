import test from "node:test";
import assert from "node:assert/strict";
import { getPublicConfig, getRuntimeConfig } from "./config.js";
import { generateTestPlan, hasTemplateHeadings, testProviderConnection } from "./generator.js";
import { getJiraIssue, jiraValueToText, validateIssueKey } from "./jira.js";

test("validates Jira issue keys without accepting arbitrary input", () => {
  assert.equal(validateIssueKey("QA-123"), true);
  assert.equal(validateIssueKey("qa_team-9"), true);
  assert.equal(validateIssueKey(" QA-123 "), true);
  assert.equal(validateIssueKey("QA-"), false);
  assert.equal(validateIssueKey("https://example.com"), false);
  assert.equal(validateIssueKey("QA-1\nmalicious"), false);
});

test("extracts Jira rich-text content recursively", () => {
  const document = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }, { text: "Second" }]
  };
  assert.equal(jiraValueToText(document), "First\nSecond");
});

test("finds acceptance criteria fields by Jira field display name", async () => {
  let requestedUrl;
  const config = {
    jira: {
      baseUrl: "https://jira.example",
      email: "qa@example.com",
      token: "test-token",
      missing: []
    }
  };
  const issue = await getJiraIssue("QA-123", config, async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        key: "QA-123",
        names: { customfield_10000: "Acceptance Criteria" },
        fields: {
          summary: "Example issue",
          description: { type: "doc", content: [{ text: "Description" }] },
          customfield_10000: [{ text: "User can sign in" }]
        }
      })
    };
  });

  assert.match(requestedUrl, /rest\/api\/3\/issue\/QA-123/);
  assert.equal(issue.title, "Example issue");
  assert.equal(issue.description, "Description");
  assert.deepEqual(issue.acceptanceCriteria, [{ name: "Acceptance Criteria", value: "User can sign in" }]);
  assert.equal(issue.sourceUrl, "https://jira.example/browse/QA-123");
});

test("requires every supplied template heading in its original order", () => {
  const template = "# Test Plan — <JIRA-KEY>: <title>\n\n## Scope\n\n## Scenarios\n\n## Review";
  assert.equal(hasTemplateHeadings("# Test Plan — QA-123: Example\n\n## Scope\n\n## Scenarios\n\n## Review", template), true);
  assert.equal(hasTemplateHeadings("# Test Plan — QA-123: Example\n\n## Scenarios\n\n## Scope\n\n## Review", template), false);
  assert.equal(hasTemplateHeadings("# Test Plan — QA-123: Example\n\n## Scope\n\n## Review", template), false);
  assert.equal(hasTemplateHeadings("# Test Plan — QA-123: Example\n\n## Scope\n\n## Scenarios\n\n## Review\n\n## Extra", template), false);
});

test("tests a model provider through the backend without exposing its key", async () => {
  let requestedUrl;
  let requestHeaders;
  const result = await testProviderConnection({
    provider: "groq",
    apiKey: "test-key"
  }, async (url, options) => {
    requestedUrl = url;
    requestHeaders = options.headers;
    return { ok: true, status: 200 };
  });

  assert.equal(requestedUrl, "https://api.groq.com/openai/v1/models");
  assert.equal(requestHeaders.Authorization, "Bearer test-key");
  assert.deepEqual(result, { message: "Groq connection successful." });
});

test("generates a template-shaped draft with deterministic model settings", async () => {
  const template = "# Test Plan — <JIRA-KEY>: <title>\n\n## Scope\n\n## Review";
  const plan = "# Test Plan — QA-123: Sign-in\n\n## Scope\nProposal: verify sign-in.\n\n## Review";
  let requestBody;
  const generated = await generateTestPlan(
    { key: "QA-123", title: "Sign-in" },
    template,
    { provider: "groq", apiKey: "test-key", model: "test-model" },
    async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: plan } }] })
      };
    }
  );

  assert.equal(generated, plan);
  assert.equal(requestBody.model, "test-model");
  assert.equal(requestBody.temperature, 0);
  assert.match(requestBody.messages[1].content, /QA-123/);
});

test("rejects model output that does not retain the supplied template", async () => {
  const template = "# Test Plan\n\n## Scope\n\n## Review";
  await assert.rejects(
    generateTestPlan({}, template, { provider: "ollama", baseUrl: "http://localhost", model: "test" }, async () => ({
      ok: true,
      json: async () => ({ message: { content: "# Test Plan\n\n## Scope" } })
    })),
    /did not preserve the supplied template/
  );
});

test("public configuration excludes Jira tokens and provider secrets", () => {
  const config = getRuntimeConfig({
    JIRA_BASE_URL: "https://jira.example",
    JIRA_EMAIL: "qa@example.com",
    JIRA_TOKEN: "private-token",
    GROQ_API_KEY: "private-key",
    GROQ_MODEL: "model",
    LLM_PROVIDER: "groq"
  });
  const publicConfig = JSON.stringify(getPublicConfig(config));
  assert.equal(publicConfig.includes("private-token"), false);
  assert.equal(publicConfig.includes("private-key"), false);
  assert.equal(publicConfig.includes("qa@example.com"), true);
});
