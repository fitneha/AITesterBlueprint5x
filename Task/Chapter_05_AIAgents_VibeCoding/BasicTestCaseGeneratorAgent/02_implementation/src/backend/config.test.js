import test from "node:test";
import assert from "node:assert/strict";
import { findEnvFile, getPublicConfig, getRuntimeConfig } from "./config.js";

test("runtime config selects a complete explicit model provider", () => {
  const config = getRuntimeConfig({
    LLM_PROVIDER: "ollama",
    OLLAMA_URL: "http://localhost:11434",
    OLLAMA_MODEL: "qa-model",
    JIRA_BASE_URL: "https://jira.example",
    JIRA_EMAIL: "qa@example.com",
    JIRA_TOKEN: "private-token",
    AI_TEST_CASE_GENERATOR_PORT: "3033",
    MAX_UPLOAD_MB: "12"
  });
  assert.equal(config.provider.provider, "ollama");
  assert.equal(config.port, 3033);
  assert.equal(config.maxUploadBytes, 12 * 1024 * 1024);
  assert.equal(config.jira.token, "private-token");
});

test("public config never exposes provider or Jira credentials", () => {
  const config = getRuntimeConfig({
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: "sensitive-model-key",
    GROQ_MODEL: "model",
    JIRA_BASE_URL: "https://jira.example",
    JIRA_EMAIL: "qa@example.com",
    JIRA_TOKEN: "sensitive-jira-token"
  });
  const publicConfig = JSON.stringify(getPublicConfig(config));
  assert.equal(publicConfig.includes("sensitive-model-key"), false);
  assert.equal(publicConfig.includes("sensitive-jira-token"), false);
});

test("environment lookup searches ancestors without requiring a copied .env", () => {
  assert.equal(typeof findEnvFile(), "string");
});
