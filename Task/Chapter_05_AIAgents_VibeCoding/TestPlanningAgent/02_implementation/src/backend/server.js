import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicConfig, getRuntimeConfig } from "./config.js";
import { GenerationError, generateTestPlan, readTemplate, testProviderConnection } from "./generator.js";
import { getJiraIssue, JiraError, testJiraConnection, validateIssueKey } from "./jira.js";

const app = express();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(currentDirectory, "../../public");

app.use(express.json({ limit: "32kb" }));

app.get("/api/config", (_request, response) => {
  response.json(getPublicConfig());
});

app.post("/api/jira/test", async (_request, response) => {
  try {
    const result = await testJiraConnection(getRuntimeConfig());
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/llm/test", async (request, response) => {
  const providerName = request.body?.provider;
  if (providerName !== "groq" && providerName !== "ollama") {
    response.status(400).json({ error: "Choose Groq or Ollama to test." });
    return;
  }

  try {
    const config = getRuntimeConfig().providers[providerName];
    if (!config.configured) {
      response.status(503).json({ error: `Missing model configuration: ${config.missing.join(", ")}.` });
      return;
    }
    response.json(await testProviderConnection(config));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/generate", async (request, response) => {
  const issueKey = request.body?.issueKey;
  if (!validateIssueKey(issueKey)) {
    response.status(400).json({ error: "Enter a valid Jira issue key, such as QA-123." });
    return;
  }

  const config = getRuntimeConfig();
  try {
    if (config.providerError) throw new GenerationError(config.providerError, 503);
    if (!config.provider) throw new GenerationError("Configure one model provider and model in the server environment.", 503);
    const issue = await getJiraIssue(issueKey, config);
    const template = await readTemplate();
    const testPlan = await generateTestPlan(issue, template, config.provider);
    response.json({
      issueKey: issue.key,
      sourceUrl: issue.sourceUrl,
      testPlan,
      provider: config.provider.provider
    });
  } catch (error) {
    sendError(response, error);
  }
});

if (existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get("*", (_request, response) => response.sendFile(resolve(frontendDirectory, "index.html")));
}

function sendError(response, error) {
  const knownError = error instanceof JiraError || error instanceof GenerationError;
  response.status(knownError ? error.status : 500).json({
    error: knownError ? error.message : "The request could not be completed. Check the server configuration and try again."
  });
}

export default app;
