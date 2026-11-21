import test from "node:test";
import assert from "node:assert/strict";
import { getPublicConfig, getRuntimeConfig } from "./config.js";
import {
  buildValidationReport,
  getRegenerableHeadings,
  hasTemplateHeadings,
  prepareStrategyMarkdown,
  readStrategyTemplate,
  replaceSection
} from "./documents.js";
import { JiraError, jiraValueToText, normalizeJiraInput, retrieveRequirements, searchJiraIssues } from "./jira.js";
import { analyzeRequirements, FINDING_FIELDS, generateStrategy, normalizeAnalysis, testProviderConnection } from "./llm.js";

const jiraConfig = {
  jira: {
    baseUrl: "https://jira.example",
    email: "qa@example.com",
    token: "test-token",
    missing: []
  }
};

function emptyAnalysis() {
  return Object.fromEntries(FINDING_FIELDS.map((field) => [field, []]));
}

function okJson(value) {
  return { ok: true, status: 200, json: async () => value };
}

test("validates issue, Epic, and project selectors", () => {
  assert.deepEqual(normalizeJiraInput({
    issueKeys: "qa-1, QA-2",
    epicKeys: ["epic-4"],
    projectKey: "iam"
  }), {
    issueKeys: ["QA-1", "QA-2"],
    epicKeys: ["EPIC-4"],
    projectKey: "IAM"
  });
  assert.throws(() => normalizeJiraInput({ issueKeys: "not-an-issue" }), JiraError);
  assert.throws(() => normalizeJiraInput({}), /at least one issue key/i);
});

test("extracts Jira rich-text content without document metadata", () => {
  const adf = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "First" }, { type: "hardBreak" }, { type: "text", text: "line" }] },
      { type: "paragraph", content: [{ type: "text", text: "Second" }] }
    ]
  };
  assert.equal(jiraValueToText(adf), "First\nline\nSecond");
});

test("paginates Jira search results using the returned cursor", async () => {
  const requestedTokens = [];
  const result = await searchJiraIssues("project = QA ORDER BY key ASC", jiraConfig, async (url) => {
    const token = new URL(url).searchParams.get("nextPageToken") || "";
    requestedTokens.push(token);
    if (!token) {
      return okJson({
        issues: [{ key: "QA-1", fields: { summary: "First" } }],
        nextPageToken: "page-two",
        isLast: false
      });
    }
    return okJson({ issues: [{ key: "QA-2", fields: { summary: "Second" } }], isLast: true });
  });

  assert.deepEqual(requestedTokens, ["", "page-two"]);
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.issues.map((issue) => issue.key), ["QA-1", "QA-2"]);
});

test("retrieves Jira issue acceptance criteria and source reference", async () => {
  const issue = await retrieveRequirements({ issueKeys: ["QA-123"] }, jiraConfig, async (url) => {
    if (url.endsWith("/rest/api/3/field")) {
      return okJson([{ id: "customfield_10000", name: "Acceptance Criteria" }]);
    }
    assert.match(url, /rest\/api\/3\/issue\/QA-123/);
    const fields = new URL(url).searchParams.get("fields");
    assert.match(fields, /customfield_10000/);
    assert.doesNotMatch(fields, /\*all/);
    return okJson({
      key: "QA-123",
      names: { customfield_10000: "Acceptance Criteria" },
      fields: {
        summary: "Create an account",
        issuetype: { name: "Story" },
        description: { type: "doc", content: [{ type: "paragraph", content: [{ text: "User can sign up" }] }] },
        customfield_10000: [{ text: "Email is required" }],
        labels: ["identity"]
      }
    });
  });

  assert.equal(issue.issues.length, 1);
  assert.equal(issue.issues[0].description, "User can sign up");
  assert.deepEqual(issue.issues[0].acceptanceCriteria, [{ name: "Acceptance Criteria", text: "Email is required" }]);
  assert.equal(issue.issues[0].sourceUrl, "https://jira.example/browse/QA-123");
});

test("retrieves Epic children across paginated search results", async () => {
  const searchTokens = [];
  const result = await retrieveRequirements({ epicKeys: ["EPIC-9"] }, jiraConfig, async (url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith("/rest/api/3/field")) return okJson([]);
    if (parsedUrl.pathname.includes("/issue/EPIC-9")) {
      return okJson({ key: "EPIC-9", fields: { summary: "Lifecycle epic", issuetype: { name: "Epic" } } });
    }

    assert.match(parsedUrl.searchParams.get("jql"), /parent/);
    const token = parsedUrl.searchParams.get("nextPageToken") || "";
    searchTokens.push(token);
    return token
      ? okJson({ issues: [{ key: "IAM-2", fields: { summary: "Second story" } }], isLast: true })
      : okJson({ issues: [{ key: "IAM-1", fields: { summary: "First story" } }], nextPageToken: "page-two", isLast: false });
  });

  assert.deepEqual(searchTokens, ["", "page-two"]);
  assert.equal(result.counts.searchPages, 2);
  assert.deepEqual(result.issues.map((issue) => issue.key), ["EPIC-9", "IAM-1", "IAM-2"]);
  assert.equal(result.issues[1].sourceRole, "child of EPIC-9");
});

test("rejects malformed analysis objects instead of silently filling missing fields", () => {
  assert.throws(() => normalizeAnalysis({ confirmedRequirements: [] }), /missing the businessObjectives analysis section/i);
  assert.deepEqual(normalizeAnalysis(emptyAnalysis()), emptyAnalysis());
});

test("returns structured analysis from a mocked model response", async () => {
  const analysis = emptyAnalysis();
  analysis.confirmedRequirements = [{ text: "Accounts can be created.", sourceRefs: ["QA-123"] }];
  const response = await analyzeRequirements([{ key: "QA-123", title: "Create account" }], {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    apiKey: "test-key"
  }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.temperature, 0);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    return okJson({ choices: [{ message: { content: JSON.stringify(analysis) } }] });
  });

  assert.deepEqual(response.confirmedRequirements, analysis.confirmedRequirements);
});

test("extracts JSON wrapped in explanatory text from non-strict model output", async () => {
  const analysis = emptyAnalysis();
  let requests = 0;
  const result = await analyzeRequirements([{ key: "QA-123" }], {
    provider: "groq",
    model: "non-strict-model",
    apiKey: "test-key"
  }, async () => {
    requests += 1;
    return okJson({ choices: [{ message: { content: `Result follows:\n${JSON.stringify(analysis)}\nDone.` } }] });
  });

  assert.equal(requests, 1);
  assert.deepEqual(result, emptyAnalysis());
});

test("retries malformed non-strict model output once", async () => {
  const analysis = emptyAnalysis();
  let requests = 0;
  const result = await analyzeRequirements([{ key: "QA-123" }], {
    provider: "groq",
    model: "non-strict-model",
    apiKey: "test-key"
  }, async (_url, options) => {
    requests += 1;
    if (requests === 1) return okJson({ choices: [{ message: { content: "This isn't JSON." } }] });
    const body = JSON.parse(options.body);
    assert.match(body.messages.at(-1).content, /valid JSON object/);
    return okJson({ choices: [{ message: { content: JSON.stringify(analysis) } }] });
  });

  assert.equal(requests, 2);
  assert.deepEqual(result, emptyAnalysis());
});

test("validates and enriches a generated strategy using the exact template", async () => {
  const template = await readStrategyTemplate();
  const headings = template.match(/^#{1,6}\s+.+$/gm);
  let title = headings[0].replace("<JIRA-KEY>", "QA-123").replace("<title>", "Create account");
  const generated = template.replace(headings[0], title);
  const result = await generateStrategy(
    [{ key: "QA-123", title: "Create account" }],
    emptyAnalysis(),
    template,
    "2026-11-20T00:00:00.000Z",
    { provider: "groq", model: "test-model", apiKey: "test-key" },
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.temperature, 0);
      return okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              strategyMarkdown: generated,
              completenessAssessment: "Review open questions before approval."
            })
          }
        }]
      });
    }
  );
  const finalDocument = prepareStrategyMarkdown(result.strategyMarkdown, template, [{
    key: "QA-123",
    title: "Create account",
    sourceRole: "selected",
    sourceUrl: "https://jira.example/browse/QA-123"
  }], "2026-11-20T00:00:00.000Z");

  assert.equal(hasTemplateHeadings(finalDocument, template), true);
  assert.match(finalDocument, /Document version:\*\* 1\.0/);
  assert.match(finalDocument, /Source Jira issues:\*\* \[QA-123\]/);
  assert.equal(getRegenerableHeadings(template).includes("## HUMAN REVIEW GATE"), false);
  assert.match(finalDocument, /Approve, or edit, before rolling this strategy out/);
  const report = buildValidationReport(emptyAnalysis(), result.completenessAssessment, [{
    key: "QA-123",
    sourceUrl: "https://jira.example/browse/QA-123"
  }], "2026-11-20T00:00:00.000Z");
  assert.match(report, /Review open questions/);
});

test("replaces a selected section without changing its heading", () => {
  const document = "# Strategy\n\n## Scope\nOld content\n\n## Risks\nKeep this.";
  const updated = replaceSection(document, "## Scope", "## Scope\nNew content");
  assert.match(updated, /## Scope\nNew content/);
  assert.match(updated, /## Risks\nKeep this\./);
});

test("tests provider connectivity using a mocked fetch", async () => {
  let url;
  const result = await testProviderConnection({
    provider: "groq",
    apiKey: "test-key"
  }, async (requestedUrl, options) => {
    url = requestedUrl;
    assert.equal(options.headers.Authorization, "Bearer test-key");
    return { ok: true, status: 200 };
  });
  assert.equal(url, "https://api.groq.com/openai/v1/models");
  assert.deepEqual(result, { message: "Groq connection successful." });
});

test("public configuration omits Jira and model-provider secrets", () => {
  const config = getRuntimeConfig({
    JIRA_BASE_URL: "https://jira.example",
    JIRA_EMAIL: "qa@example.com",
    JIRA_TOKEN: "private-jira-token",
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: "private-groq-key",
    GROQ_MODEL: "model"
  });
  const publicConfig = JSON.stringify(getPublicConfig(config));
  assert.equal(publicConfig.includes("private-jira-token"), false);
  assert.equal(publicConfig.includes("private-groq-key"), false);
});
