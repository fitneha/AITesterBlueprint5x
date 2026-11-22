import test from "node:test";
import assert from "node:assert/strict";
import { generateSuite } from "./generation.js";
import { readDefaultTemplate } from "./template.js";

function modelResponse(data) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(data) } }]
    })
  };
}

test("generation uses two model passes, preserves template columns, and remains a draft", async () => {
  const template = await readDefaultTemplate();
  const outputs = [
    {
      title: "Login test cases",
      requirementSummary: "Users can log in with valid credentials.",
      requirements: [{ id: "REQ-1", text: "Valid credentials open the dashboard.", sourceIds: ["manual-1"], acceptanceCriteria: [] }],
      functionalAreas: ["Authentication"],
      ambiguities: [],
      conflicts: [],
      assumptions: [],
      dependencies: [],
      risks: [],
      testCases: [{
        testId: "TC-001",
        description: "Log in with valid credentials",
        preconditions: "An active user account exists.",
        steps: ["Open the login page", "Submit valid credentials"],
        expectedResult: "The dashboard is displayed.",
        priority: "P1",
        riskRationale: "Core user flow.",
        type: "positive",
        categories: ["functional", "positive"],
        requirementIds: ["REQ-1"]
      }],
      uncoveredRequirements: [],
      automationRecommendations: []
    },
    {
      findings: [],
      revisions: [],
      additions: [{
        testId: "TC-002",
        description: "Reject invalid credentials",
        preconditions: "An active user account exists.",
        steps: ["Open the login page", "Submit an invalid password"],
        expectedResult: "The sign-in is rejected and an error is shown.",
        priority: "P1",
        riskRationale: "Invalid credential handling is explicitly required.",
        type: "negative",
        categories: ["functional", "negative"],
        requirementIds: ["REQ-1"]
      }],
      conclusion: "The original case is actionable; an invalid credential case was added."
    }
  ];
  let callCount = 0;
  const fetchImpl = async () => modelResponse(outputs[callCount++]);
  const result = await generateSuite({
    sources: [{
      id: "manual-1", sourceId: "manual-1", sourceIds: ["manual-1"], type: "manual",
      title: "Manual requirements", text: "Valid credentials open the dashboard."
    }],
    template,
    testCaseTarget: 1,
    sourcePrecedence: "jira",
    provider: { provider: "groq", apiKey: "test-key", model: "test-model" },
    fetchImpl
  });

  assert.equal(callCount, 2);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.approved, false);
  assert.equal(result.requestedCaseTarget, 1);
  assert.equal(result.sourcePrecedence, "jira");
  assert.equal(result.coverage.requirementsCovered, 1);
  assert.equal(result.testCases.length, 2);
  assert.equal(result.coverage.categoryCounts.functional, 2);
  assert.equal(result.coverage.categoryCounts.positive, 1);
  assert.equal(result.coverage.categoryCounts.negative, 1);
  assert.equal(result.testCases[0].steps, "1. Open the login page\n2. Submit valid credentials");
  assert.match(result.testCaseMarkdown, /^\| Test ID \| Description \| Pre-conditions \| Steps \| Expected Result \| Priority \|/);
});

test("generation fails explicitly when the model returns invalid JSON", async () => {
  const template = await readDefaultTemplate();
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "not json" } }] })
  });
  await assert.rejects(() => generateSuite({
    sources: [{ id: "manual-1", sourceId: "manual-1", text: "A requirement" }],
    template,
    provider: { provider: "groq", apiKey: "test-key", model: "test-model" },
    fetchImpl
  }), /malformed structured output/);
});
