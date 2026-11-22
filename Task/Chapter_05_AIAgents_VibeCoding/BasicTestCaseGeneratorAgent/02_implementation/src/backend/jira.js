import { Buffer } from "node:buffer";

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,9}-\d+$/;
const MAX_LINKED_ISSUES = 30;

export class JiraError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

export function validateIssueKey(key) {
  return typeof key === "string" && ISSUE_KEY_PATTERN.test(key.trim().toUpperCase());
}

export function toPlainText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  if (value.type === "text" && typeof value.text === "string") return value.text;
  if (Array.isArray(value.content)) return value.content.map(toPlainText).filter(Boolean).join("\n");
  if (typeof value.text === "string") return value.text;
  return Object.values(value).map(toPlainText).filter(Boolean).join(" ");
}

function makeAuth(config) {
  return `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;
}

function validateJiraUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new JiraError("JIRA_BASE_URL is not a valid URL.", 503);
  }
  const isLocalDev = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocalDev && url.protocol === "http:")) {
    throw new JiraError("JIRA_BASE_URL must use HTTPS.", 503);
  }
  if (url.username || url.password) throw new JiraError("JIRA_BASE_URL must not contain credentials.", 503);
  return url;
}

async function jiraRequest(path, config, fetchImpl) {
  if (config.missing?.length) {
    throw new JiraError(`Jira is not fully configured: ${config.missing.join(", ")}.`, 503);
  }
  const base = validateJiraUrl(config.baseUrl);
  const url = new URL(path.replace(/^\//, ""), `${base.href.replace(/\/+$/, "")}/`);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Authorization: makeAuth(config),
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new JiraError("Could not reach Jira. Check the server network and Jira URL.", 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new JiraError("Jira rejected the configured credentials or the account lacks access.", 502);
  }
  if (response.status === 404) throw new JiraError("A Jira issue or resource was not found or is inaccessible.", 404);
  if (!response.ok) throw new JiraError(`Jira returned an unexpected response (${response.status}).`, 502);
  return response.json();
}

function normalizeIssue(raw, baseUrl, acceptanceFieldIds = []) {
  const fields = raw.fields || {};
  const links = (fields.issuelinks || []).map((link) => {
    const linked = link.inwardIssue || link.outwardIssue;
    return linked ? { key: linked.key, summary: linked.fields?.summary || "Not specified" } : null;
  }).filter(Boolean);
  const description = toPlainText(fields.description) || "Not specified";
  const acceptanceCriteria = acceptanceFieldIds.map((id) => toPlainText(fields[id])).filter(Boolean).join("\n") || "Not specified";
  const text = [
    `Issue: ${raw.key}`,
    `Summary: ${fields.summary || "Not specified"}`,
    `Issue type: ${fields.issuetype?.name || "Not specified"}`,
    `Status: ${fields.status?.name || "Not specified"}`,
    `Priority: ${fields.priority?.name || "Not specified"}`,
    `Description: ${description}`,
    `Acceptance criteria: ${acceptanceCriteria}`,
    `Labels: ${(fields.labels || []).join(", ") || "Not specified"}`,
    `Components: ${(fields.components || []).map((component) => component.name).join(", ") || "Not specified"}`,
    `Linked issues: ${links.map(({ key, summary }) => `${key}: ${summary}`).join("; ") || "Not specified"}`,
    `Attachments (metadata only): ${(fields.attachment || []).map(({ filename, mimeType }) => `${filename} (${mimeType})`).join("; ") || "Not specified"}`
  ].join("\n");
  return {
    id: raw.key,
    title: fields.summary || "Not specified",
    issueType: fields.issuetype?.name || "Not specified",
    status: fields.status?.name || "Not specified",
    priority: fields.priority?.name || "Not specified",
    description,
    acceptanceCriteria,
    text,
    labels: fields.labels || [],
    components: (fields.components || []).map((component) => component.name),
    parentKey: fields.parent?.key || null,
    issueLinks: links,
    attachments: (fields.attachment || []).map(({ filename, mimeType }) => ({ filename, mimeType })),
    sourceUrl: `${baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(raw.key)}`
  };
}

async function getIssue(key, config, fetchImpl, acceptanceFieldIds) {
  const fields = ["summary", "description", "issuetype", "status", "priority", "labels", "components", "issuelinks", "attachment", "parent", ...acceptanceFieldIds];
  const path = `rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields.join(","))}`;
  const issue = await jiraRequest(path, config, fetchImpl);
  const normalized = normalizeIssue(issue, config.baseUrl, acceptanceFieldIds);
  try {
    const comments = await jiraRequest(
      `rest/api/3/issue/${encodeURIComponent(key)}/comment?maxResults=10&orderBy=-created`,
      config,
      fetchImpl
    );
    normalized.comments = (comments.comments || []).map((comment) => toPlainText(comment.body)).filter(Boolean);
    if (normalized.comments.length) normalized.text += `\nComments:\n${normalized.comments.join("\n")}`;
  } catch (error) {
    normalized.comments = [];
    normalized.commentWarning = error.message;
  }
  return normalized;
}

async function getEpicChildren(epicKey, config, fetchImpl, acceptanceFieldIds) {
  const children = new Map();
  const warnings = [];
  for (const jql of [`parent = "${epicKey}"`, `"Epic Link" = "${epicKey}"`]) {
    try {
      const result = await jiraRequest(
        `rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=${encodeURIComponent(["summary", "description", "issuetype", "status", "priority", "labels", "components", "parent", ...acceptanceFieldIds].join(","))}`,
        config,
        fetchImpl
      );
      for (const issue of result.issues || []) {
        if (issue.key !== epicKey) children.set(issue.key, normalizeIssue(issue, config.baseUrl, acceptanceFieldIds));
        if (children.size >= MAX_LINKED_ISSUES) break;
      }
    } catch (error) {
      warnings.push(`Could not retrieve children for ${epicKey}: ${error.message}`);
    }
    if (children.size >= MAX_LINKED_ISSUES) break;
  }
  return { children: [...children.values()], warnings };
}

export async function testJiraConnection(config, fetchImpl = fetch) {
  await jiraRequest("rest/api/3/myself", config, fetchImpl);
  return { message: "Jira connection successful." };
}

export async function fetchJiraSources(issueKeys, config, fetchImpl = fetch) {
  if (!Array.isArray(issueKeys) || issueKeys.length === 0) return { sources: [], warnings: [] };
  const normalizedKeys = [...new Set(issueKeys.map((key) => String(key).trim().toUpperCase()))];
  if (normalizedKeys.some((key) => !validateIssueKey(key))) {
    throw new JiraError("One or more Jira issue keys are invalid.", 400);
  }
  if (normalizedKeys.length > 10) throw new JiraError("Enter no more than 10 Jira issue keys per generation.", 400);

  const sources = [];
  const warnings = [];
  let acceptanceFieldIds = [];
  try {
    const fields = await jiraRequest("rest/api/3/field", config.jira, fetchImpl);
    acceptanceFieldIds = (Array.isArray(fields) ? fields : [])
      .filter((field) => /acceptance criteria|acceptance criterion/i.test(field.name || ""))
      .map((field) => field.id);
    if (!acceptanceFieldIds.length) warnings.push("Jira did not expose a field named Acceptance Criteria; acceptance criteria were not retrieved.");
  } catch (error) {
    warnings.push(`Jira acceptance-criteria field metadata was not retrieved: ${error.message}`);
  }
  for (const key of normalizedKeys) {
    const issue = await getIssue(key, config.jira, fetchImpl, acceptanceFieldIds);
    if (issue.commentWarning) warnings.push(`${key} comments were not retrieved: ${issue.commentWarning}`);
    sources.push({ type: "jira", ...issue });

    if (/epic/i.test(issue.issueType)) {
      const { children, warnings: epicWarnings } = await getEpicChildren(key, config.jira, fetchImpl, acceptanceFieldIds);
      sources.push(...children.map((child) => ({ type: "jira", ...child })));
      warnings.push(...epicWarnings);
    }
    if (issue.parentKey && !sources.some((source) => source.id === issue.parentKey)) {
      try {
        const parent = await getIssue(issue.parentKey, config.jira, fetchImpl, acceptanceFieldIds);
        sources.push({ type: "jira", ...parent });
        if (parent.commentWarning) warnings.push(`${issue.parentKey} comments were not retrieved: ${parent.commentWarning}`);
      } catch (error) {
        warnings.push(`Parent Jira issue ${issue.parentKey} was not included: ${error.message}`);
      }
    }
    const linkedKeys = issue.issueLinks.map(({ key: linkedKey }) => linkedKey);
    for (const linkedKey of linkedKeys.slice(0, MAX_LINKED_ISSUES - 1)) {
      if (sources.some((source) => source.id === linkedKey)) continue;
      try {
        const linked = await getIssue(linkedKey, config.jira, fetchImpl, acceptanceFieldIds);
        if (linked.commentWarning) warnings.push(`${linkedKey} comments were not retrieved: ${linked.commentWarning}`);
        sources.push({ type: "jira", ...linked });
      } catch (error) {
        warnings.push(`Linked Jira issue ${linkedKey} was not included: ${error.message}`);
      }
    }
  }
  return { sources, warnings };
}
