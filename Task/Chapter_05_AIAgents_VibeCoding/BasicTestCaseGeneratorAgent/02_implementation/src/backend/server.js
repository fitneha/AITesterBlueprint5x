import express from "express";
import multer from "multer";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicConfig, getRuntimeConfig } from "./config.js";
import { JiraError, testJiraConnection } from "./jira.js";
import { collectSources } from "./sources.js";
import { SourceError } from "./documents.js";
import { generateSuite, calculateCoverage, regenerateCase } from "./generation.js";
import { ModelError, testModelConnection } from "./model.js";
import { readDefaultTemplate, parseTemplate, validateTestCases, renderTemplateCases } from "./template.js";
import { buildCsv, buildJiraCsv, buildXlsx } from "./exports.js";
import { buildQaReport } from "./reports.js";
import { getGeneration, saveGeneration } from "./session-store.js";

const app = express();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(currentDirectory, "../frontend/dist");
const rateCounts = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: getRuntimeConfig().maxUploadBytes,
    files: 6,
    fields: 8,
    fieldSize: 64 * 1024
  }
});

app.use(express.json({ limit: "1mb" }));

function rateLimit(request, response, next) {
  const key = request.socket.remoteAddress || "local";
  const now = Date.now();
  const window = rateCounts.get(key);
  if (!window || now - window.start > 60_000) {
    rateCounts.set(key, { start: now, count: 1 });
    next();
    return;
  }
  if (window.count >= 10) {
    response.status(429).json({ error: "Generation rate limit reached. Wait a minute and try again." });
    return;
  }
  window.count += 1;
  next();
}

function getDraftSession(generationId) {
  const session = getGeneration(generationId);
  return session?.kind === "generation" ? session : null;
}

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/config", (_request, response) => {
  response.json({
    ...getPublicConfig(),
    uploadLimitBytes: getRuntimeConfig().maxUploadBytes,
    templateName: "Template1_Basic_TC_Gen.md"
  });
});

app.get("/api/template", async (_request, response) => {
  try {
    const template = await readDefaultTemplate();
    const parsed = parseTemplate(template);
    response.json({ template, fields: parsed.fields, name: "Template1_Basic_TC_Gen.md" });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/jira/test", async (_request, response) => {
  try {
    response.json(await testJiraConnection(getRuntimeConfig().jira));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/llm/test", async (request, response) => {
  const name = request.body?.provider;
  if (name !== "groq" && name !== "ollama") {
    response.status(400).json({ error: "Choose Groq or Ollama to test." });
    return;
  }
  try {
    const config = getRuntimeConfig();
    if (!config.providers[name].configured) {
      response.status(503).json({ error: `Missing model configuration: ${config.providers[name].missing.join(", ")}.` });
      return;
    }
    response.json(await testModelConnection(config.providers[name]));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/preview", rateLimit, upload.fields([
  { name: "documents", maxCount: 5 },
  { name: "template", maxCount: 1 }
]), async (request, response) => {
  const config = getRuntimeConfig();
  try {
    const targetValue = String(request.body?.testCaseTarget || "").trim();
    const testCaseTarget = targetValue ? Number(targetValue) : null;
    if (testCaseTarget !== null && (!Number.isInteger(testCaseTarget) || testCaseTarget < 1 || testCaseTarget > 100)) {
      throw new SourceError("The desired test case count must be a whole number between 1 and 100.");
    }
    const sourcePrecedence = String(request.body?.sourcePrecedence || "none");
    if (!["none", "manual", "jira", "documents"].includes(sourcePrecedence)) {
      throw new SourceError("Choose a supported source precedence option.");
    }
    const files = request.files?.documents || [];
    const sources = await collectSources({
      manualText: request.body?.manualText,
      issueKeys: request.body?.issueKeys,
      urls: request.body?.urls,
      files
    }, config);

    let template = await readDefaultTemplate();
    const templateFile = request.files?.template?.[0];
    if (templateFile) {
      if (!/\.md$/i.test(templateFile.originalname)) {
        throw new SourceError("Only Markdown (.md) template files are supported.");
      }
      if (templateFile.size > 100 * 1024) throw new SourceError("The template file exceeds the 100 KB limit.", 413);
      try {
        template = new TextDecoder("utf-8", { fatal: true }).decode(templateFile.buffer);
      } catch {
        throw new SourceError("The template file must be valid UTF-8 Markdown.");
      }
    }
    try {
      parseTemplate(template);
    } catch (error) {
      throw new SourceError(error.message);
    }

    const previewId = randomUUID();
    saveGeneration(previewId, {
      kind: "preview",
      sources: sources.sources,
      statuses: sources.statuses,
      warnings: sources.warnings,
      template,
      testCaseTarget,
      sourcePrecedence,
      started: false,
      completed: false
    });
    response.json({
      previewId,
      statuses: sources.statuses,
      warnings: sources.warnings,
      testCaseTarget,
      sourcePrecedence,
      templateName: request.files?.template?.[0]?.originalname || "Template1_Basic_TC_Gen.md",
      sources: sources.sources.map(({ id, sourceId, sourceIds, alsoFrom, type, title, url, text, truncated }) => ({
        id: sourceIds?.[0] || sourceId || id,
        sourceIds: sourceIds || [sourceId || id],
        ...(alsoFrom?.length ? { alsoFrom } : {}),
        type,
        title,
        ...(url ? { url } : {}),
        text,
        characterCount: text.length,
        truncated: Boolean(truncated)
      }))
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/generate", rateLimit, async (request, response) => {
  const preview = getGeneration(request.body?.previewId);
  if (!preview || preview.kind !== "preview") {
    response.status(404).json({ error: "The source preview expired. Submit the sources again." });
    return;
  }
  if (preview.started || preview.completed) {
    response.status(409).json({ error: "This source preview has already been submitted for generation." });
    return;
  }
  const config = getRuntimeConfig();
  if (config.providerError) {
    response.status(503).json({ error: config.providerError });
    return;
  }
  preview.started = true;
  try {
    const result = await generateSuite({
      sources: preview.sources,
      template: preview.template,
      testCaseTarget: preview.testCaseTarget,
      sourcePrecedence: preview.sourcePrecedence,
      provider: config.provider
    });
    result.sourceStatuses = preview.statuses;
    result.warnings = [...preview.warnings, ...result.warnings];
    saveGeneration(result.id, {
      kind: "generation",
      result,
      sources: preview.sources,
      template: preview.template
    });
    preview.completed = true;
    response.json(result);
  } catch (error) {
    preview.started = false;
    sendError(response, error);
  }
});

app.post("/api/edit", (request, response) => {
  const session = getDraftSession(request.body?.generationId);
  if (!session) {
    response.status(404).json({ error: "This draft is no longer available. Generate it again to continue editing." });
    return;
  }
  try {
    const updates = request.body?.updates;
    if (!Array.isArray(updates) || updates.length > session.result.testCases.length) {
      throw new SourceError("Provide valid test case edits.", 400);
    }
    const byId = new Map(updates.map((item) => [item.testId, item]));
    const changed = session.result.testCases.map((prior) => {
      const update = byId.get(prior.testId);
      if (!update) return prior;
      return {
        ...prior,
        description: update.description ?? prior.description,
        preconditions: update.preconditions ?? prior.preconditions,
        steps: update.steps ?? prior.steps,
        expectedResult: update.expectedResult ?? prior.expectedResult,
        priority: update.priority ?? prior.priority
      };
    });
    let validated;
    try {
      validated = validateTestCases(changed).map((testCase, index) => ({
        ...testCase,
        type: changed[index].type,
        riskRationale: changed[index].riskRationale,
        categories: changed[index].categories,
        requirementIds: changed[index].requirementIds
      }));
    } catch (error) {
      throw new SourceError(error.message, 400);
    }
    session.result.testCases = validated;
    session.result.coverage = calculateCoverage(session.result.requirements, validated);
    session.result.uncoveredRequirements = session.result.coverage.uncoveredRequirements;
    session.result.testCaseMarkdown = renderTemplateCases(validated, session.template);
    session.result.status = "DRAFT";
    session.result.approved = false;
    delete session.result.approvedAt;
    response.json(session.result);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/regenerate-case", rateLimit, async (request, response) => {
  const session = getDraftSession(request.body?.generationId);
  if (!session) {
    response.status(404).json({ error: "This draft is no longer available. Generate it again to continue." });
    return;
  }
  try {
    const config = getRuntimeConfig();
    if (config.providerError) throw new ModelError(config.providerError, 503);
    const revised = await regenerateCase({
      suite: session.result,
      testId: request.body?.testId,
      instruction: request.body?.instruction,
      provider: config.provider
    });
    const cases = session.result.testCases.map((testCase) => testCase.testId === revised.testId ? revised : testCase);
    session.result.testCases = cases;
    session.result.coverage = calculateCoverage(session.result.requirements, cases);
    session.result.uncoveredRequirements = session.result.coverage.uncoveredRequirements;
    session.result.testCaseMarkdown = renderTemplateCases(cases, session.template);
    session.result.status = "DRAFT";
    session.result.approved = false;
    delete session.result.approvedAt;
    response.json({ result: session.result, revised });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/approve", (request, response) => {
  const session = getDraftSession(request.body?.generationId);
  if (!session) {
    response.status(404).json({ error: "This draft is no longer available. Generate it again before approval." });
    return;
  }
  session.result.status = "QA APPROVED";
  session.result.approved = true;
  session.result.approvedAt = new Date().toISOString();
  response.json(session.result);
});

app.post("/api/export", async (request, response) => {
  const session = getDraftSession(request.body?.generationId);
  if (!session) {
    response.status(404).json({ error: "This draft is no longer available. Generate it again before exporting." });
    return;
  }
  try {
    const { result } = session;
    const format = request.body?.format;
    const safeId = result.id;
    if (format === "markdown") {
      response.type("text/markdown").attachment(`test-cases-${safeId}.md`).send(result.testCaseMarkdown);
    } else if (format === "report") {
      response.type("text/markdown").attachment(`qa-analysis-${safeId}.md`).send(buildQaReport(result));
    } else if (format === "csv") {
      response.type("text/csv").attachment(`test-cases-${safeId}.csv`).send(buildCsv(result.testCases));
    } else if (format === "jira-csv") {
      let csv;
      try {
        csv = buildJiraCsv(result.testCases, {
          projectKey: request.body?.projectKey,
          issueType: request.body?.issueType
        });
      } catch (error) {
        throw new SourceError(error.message, 400);
      }
      response.type("text/csv").attachment(`jira-test-cases-${safeId}.csv`).send(csv);
    } else if (format === "xlsx") {
      const workbook = await buildXlsx(result.testCases);
      response.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .attachment(`test-cases-${safeId}.xlsx`)
        .send(Buffer.from(workbook));
    } else {
      throw new SourceError("Choose Markdown, CSV, Excel, QA report, or Jira CSV export.", 400);
    }
  } catch (error) {
    sendError(response, error);
  }
});

if (existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get("*", (_request, response) => response.sendFile(resolve(frontendDirectory, "index.html")));
}

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.status(status).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? "An uploaded file exceeds the configured size limit."
        : "The upload exceeded the number or field limits."
    });
    return;
  }
  sendError(response, error);
});

function sendError(response, error) {
  const known = error instanceof JiraError || error instanceof ModelError || error instanceof SourceError;
  if (!known) console.error(`Unhandled application error: ${error?.name || "Error"}`);
  response.status(known ? error.status : 500).json({
    error: known ? error.message : "The request could not be completed. Check server configuration and try again."
  });
}

export default app;
