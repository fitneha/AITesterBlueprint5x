import { randomUUID } from "node:crypto";
import { fetchJiraSources, validateIssueKey } from "./jira.js";
import { extractUploadedFile, fetchDocumentSource, SourceError } from "./documents.js";

const MAX_SOURCE_COUNT = 10;
const MAX_MANUAL_CHARS = 50000;
const MAX_SOURCE_CHARS = 50000;
const MAX_COMBINED_CHARS = 100000;

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  if (typeof value !== "string") return [];
  return value.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
}

function splitUrls(value) {
  if (Array.isArray(value)) return value.flatMap(splitUrls);
  if (typeof value !== "string") return [];
  return value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
}

export async function collectSources({ manualText, issueKeys, urls, files }, config, fetchImpl = fetch) {
  const manual = typeof manualText === "string" ? manualText.trim() : "";
  const keys = [...new Set(splitList(issueKeys).map((key) => key.toUpperCase()))];
  const links = [...new Set(splitUrls(urls))];
  if (!manual && !keys.length && !links.length && !files?.length) {
    throw new SourceError("Add a Jira issue, document URL, uploaded file, or manual requirement text.");
  }
  if (manual.length > MAX_MANUAL_CHARS) throw new SourceError("Manual requirements exceed the 50,000 character limit.", 413);
  if (keys.length + links.length + (files?.length || 0) > MAX_SOURCE_COUNT) {
    throw new SourceError(`Use no more than ${MAX_SOURCE_COUNT} Jira keys, document URLs, and uploaded files per request.`);
  }

  const sources = [];
  const statuses = [];
  const warnings = [];
  if (manual) {
    const id = `manual-${randomUUID()}`;
    sources.push({
      id,
      type: "manual",
      title: "Manual requirements",
      text: manual.slice(0, MAX_MANUAL_CHARS),
      truncated: false
    });
    statuses.push({ id, type: "manual", status: "retrieved", title: "Manual requirements" });
  }

  for (const key of keys) {
    if (!validateIssueKey(key)) {
      statuses.push({ type: "jira", status: "failed", title: key, message: "Invalid Jira issue key." });
      warnings.push(`Jira issue key ${key} is invalid and was not retrieved.`);
      continue;
    }
    try {
      const result = await fetchJiraSources([key], config, fetchImpl);
      sources.push(...result.sources.map((source) => {
        const truncated = source.text.length > MAX_SOURCE_CHARS;
        if (truncated) warnings.push(`${source.id} Jira content was truncated at ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
        statuses.push({
          id: `jira-${source.id}`,
          type: "jira",
          status: "retrieved",
          title: source.id,
          url: source.sourceUrl
        });
        return {
          ...source,
          text: source.text.slice(0, MAX_SOURCE_CHARS),
          truncated,
          url: source.sourceUrl,
          sourceId: `jira-${source.id}`
        };
      }));
      warnings.push(...result.warnings);
    } catch (error) {
      statuses.push({ type: "jira", status: "failed", title: key, message: error.message });
      warnings.push(`Jira issue ${key} was not retrieved: ${error.message}`);
    }
  }

  for (const link of links) {
    try {
      const source = await fetchDocumentSource(link, config, fetchImpl);
      source.sourceId = source.id;
      sources.push(source);
      statuses.push({ id: source.id, type: "url", status: "retrieved", title: source.title, url: source.url });
      if (source.truncated) warnings.push(`${source.title} was truncated at the configured content limit.`);
    } catch (error) {
      statuses.push({ type: "url", status: "failed", title: link, message: error.message });
      warnings.push(`Document URL ${link} was not retrieved: ${error.message}`);
    }
  }

  for (const file of files || []) {
    try {
      const source = await extractUploadedFile(file, config.maxUploadBytes);
      source.sourceId = source.id;
      sources.push(source);
      statuses.push({ id: source.id, type: "upload", status: "retrieved", title: source.title });
      if (source.truncated) warnings.push(`${source.title} was truncated at the configured content limit.`);
    } catch (error) {
      statuses.push({ type: "upload", status: "failed", title: file.originalname || "Uploaded file", message: error.message });
      warnings.push(`Uploaded file ${file.originalname || "unknown"} was not read: ${error.message}`);
    }
  }

  const contentHashes = new Map();
  const uniqueSources = [];
  for (const source of sources) {
    const normalized = source.text.toLowerCase().replace(/\s+/g, " ").trim();
    const prior = contentHashes.get(normalized);
    if (prior) {
      prior.sourceIds.push(source.sourceId || source.id);
      prior.alsoFrom.push({
        type: source.type,
        title: source.title,
        ...(source.url ? { url: source.url } : {})
      });
      warnings.push(`Duplicate source content detected for ${source.title}; it was included only once.`);
      continue;
    }
    const prepared = {
      ...source,
      sourceIds: [source.sourceId || source.id],
      alsoFrom: []
    };
    contentHashes.set(normalized, prepared);
    uniqueSources.push(prepared);
  }

  if (!uniqueSources.length) {
    const detail = warnings.length ? ` ${warnings.slice(0, 3).join(" ")}` : "";
    throw new SourceError(`No requirement sources could be read.${detail}`, 422);
  }
  const combinedChars = uniqueSources.reduce((total, source) => total + source.text.length, 0);
  if (combinedChars > MAX_COMBINED_CHARS) {
    throw new SourceError(`Combined source content exceeds the ${MAX_COMBINED_CHARS.toLocaleString()} character limit. Narrow the sources or provide smaller documents.`, 413);
  }
  return { sources: uniqueSources, statuses, warnings };
}
