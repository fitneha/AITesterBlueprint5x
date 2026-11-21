import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicConfig, getRuntimeConfig } from "./config.js";
import {
  buildRequirementAnalysisMarkdown,
  buildValidationReport,
  extractSection,
  getRegenerableHeadings,
  getTemplateHeadings,
  hasTemplateHeadings,
  prepareStrategyMarkdown,
  readStrategyTemplate,
  replaceSection,
  TemplateError
} from "./documents.js";
import { GenerationError } from "./errors.js";
import { JiraError, retrieveRequirements, testJiraConnection, validateIssueKey } from "./jira.js";
import {
  analyzeRequirements,
  FINDING_FIELDS,
  generateStrategy,
  normalizeAnalysis,
  regenerateStrategySection,
  testProviderConnection
} from "./llm.js";

const app = express();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(currentDirectory, "../frontend/dist");

app.use(express.json({ limit: "10mb" }));

app.get("/api/config", (_request, response) => {
  response.json(getPublicConfig());
});

app.get("/api/template", async (_request, response) => {
  try {
    const template = await readStrategyTemplate();
    response.json({ headings: getTemplateHeadings(template) });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/jira/test", async (_request, response) => {
  try {
    response.json(await testJiraConnection(getRuntimeConfig()));
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
    const provider = getRuntimeConfig().providers[providerName];
    if (!provider.configured) {
      response.status(503).json({ error: `Missing model configuration: ${provider.missing.join(", ")}.` });
      return;
    }
    response.json(await testProviderConnection(provider));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/analyze", async (request, response) => {
  const config = getRuntimeConfig();
  try {
    const provider = requireProvider(config);
    const sources = await retrieveRequirements(request.body, config);
    const analysis = await analyzeRequirements(sources.issues, provider);
    response.json({
      sources,
      analysis,
      analysisMarkdown: buildRequirementAnalysisMarkdown(analysis, sources.issues.length),
      analyzedAt: new Date().toISOString(),
      provider: provider.provider
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/strategy/generate", async (request, response) => {
  try {
    const config = getRuntimeConfig();
    const provider = requireProvider(config);
    const { sources, analysis } = validateReviewedData(request.body);
    const template = await readStrategyTemplate();
    const generatedAt = new Date().toISOString();
    const generated = await generateStrategy(sources.issues, analysis, template, generatedAt, provider);
    const strategyMarkdown = prepareStrategyMarkdown(generated.strategyMarkdown, template, sources.issues, generatedAt);
    const validationReport = buildValidationReport(analysis, generated.completenessAssessment, sources.issues, generatedAt);
    response.json({
      strategyMarkdown,
      validationReport,
      generatedAt,
      provider: provider.provider,
      sections: getRegenerableHeadings(template)
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/strategy/regenerate-section", async (request, response) => {
  try {
    const config = getRuntimeConfig();
    const provider = requireProvider(config);
    const { sources, analysis } = validateReviewedData(request.body);
    const heading = request.body?.heading;
    const currentMarkdown = request.body?.currentMarkdown;
    if (typeof heading !== "string" || typeof currentMarkdown !== "string") {
      response.status(400).json({ error: "Choose a strategy section to regenerate." });
      return;
    }

    const template = await readStrategyTemplate();
    const sections = getRegenerableHeadings(template);
    if (!sections.includes(heading)) {
      response.status(400).json({ error: "The selected section is not part of the supplied template." });
      return;
    }
    const currentSection = extractSection(currentMarkdown, heading);
    if (!currentSection) {
      response.status(400).json({ error: "The selected section was not found in the current strategy." });
      return;
    }
    const sectionMarkdown = await regenerateStrategySection(
      { heading, currentMarkdown: currentSection },
      sources.issues,
      analysis,
      provider
    );
    const headingLines = getTemplateHeadings(sectionMarkdown);
    if (headingLines.length !== 1 || headingLines[0] !== heading) {
      throw new GenerationError("The regenerated section did not preserve its template heading. Please retry.", 502);
    }
    response.json({ sectionMarkdown, strategyMarkdown: replaceSection(currentMarkdown, heading, sectionMarkdown) });
  } catch (error) {
    sendError(response, error);
  }
});

if (existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get("*", (_request, response) => response.sendFile(resolve(frontendDirectory, "index.html")));
}

function requireProvider(config) {
  if (config.providerError) throw new GenerationError(config.providerError, 503);
  if (!config.activeProvider) {
    throw new GenerationError("Configure one AI provider and model in the server environment.", 503);
  }
  return config.activeProvider;
}

function validateReviewedData(body) {
  const sources = body?.sources;
  if (!sources || !Array.isArray(sources.issues) || sources.issues.length === 0) {
    throw new GenerationError("Analyze Jira requirements before generating the strategy.", 400);
  }
  if (!body.analysis || !FINDING_FIELDS.every((field) => Array.isArray(body.analysis[field]))) {
    throw new GenerationError("Review and analyze requirements before generating the strategy.", 400);
  }
  const issues = sources.issues.filter((issue) => issue && validateIssueKey(issue.key));
  if (issues.length !== sources.issues.length) {
    throw new GenerationError("The reviewed Jira source data is invalid. Run requirement analysis again.", 400);
  }
  return { sources: { ...sources, issues }, analysis: normalizeAnalysis(body.analysis) };
}

function sendError(response, error) {
  const knownError = error instanceof JiraError || error instanceof GenerationError || error instanceof TemplateError;
  response.status(knownError ? error.status : 500).json({
    error: knownError ? error.message : "The request could not be completed. Check the server configuration and try again."
  });
}

export default app;
