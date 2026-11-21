const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/i;
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/i;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_RELATED_ISSUES = 100;
const BASE_FIELDS = ["summary", "description", "issuetype", "status", "priority", "labels", "components", "environment", "issuelinks", "parent"];

export class JiraError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

export function validateIssueKey(value) {
  return typeof value === "string" && ISSUE_KEY_PATTERN.test(value.trim());
}

function unique(values) {
  return [...new Set(values)];
}

function parseKeys(values, label) {
  if (values === undefined || values === null || values === "") return [];
  const entries = Array.isArray(values) ? values : [values];
  if (!entries.every((entry) => typeof entry === "string")) {
    throw new JiraError(`${label} must contain Jira issue keys.`, 400);
  }
  const keys = unique(entries.flatMap((entry) => entry.split(/[,\s]+/)).filter(Boolean).map((key) => key.toUpperCase()));
  if (!keys.every(validateIssueKey)) {
    throw new JiraError(`Enter valid ${label.toLowerCase()} such as QA-123.`, 400);
  }
  return keys;
}

export function normalizeJiraInput(input = {}) {
  const issueKeys = parseKeys(input.issueKeys, "Issue keys");
  const epicKeys = parseKeys(input.epicKeys, "Epic keys");
  const projectKey = typeof input.projectKey === "string" ? input.projectKey.trim().toUpperCase() : "";

  if (projectKey && !PROJECT_KEY_PATTERN.test(projectKey)) {
    throw new JiraError("Enter a valid Jira project key.", 400);
  }
  if (!issueKeys.length && !epicKeys.length && !projectKey) {
    throw new JiraError("Enter at least one issue key, Epic key, or project key.", 400);
  }

  return { issueKeys, epicKeys, projectKey };
}

export function jiraValueToText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(jiraValueToText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (value.type === "hardBreak") return "\n";
  if (Array.isArray(value.content)) {
    const separator = value.type === "doc" ? "\n" : "";
    return value.content.map(jiraValueToText).filter(Boolean).join(separator);
  }
  return Object.entries(value)
    .filter(([key]) => !["type", "attrs", "version"].includes(key))
    .map(([, item]) => jiraValueToText(item))
    .filter(Boolean)
    .join("\n");
}

async function jiraRequest(path, config, fetchImpl) {
  const baseUrl = config.jira.baseUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.jira.email}:${config.jira.token}`).toString("base64")}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new JiraError("Jira did not respond in time. Try again later.", 504);
    }
    throw new JiraError("Could not reach Jira. Check the server network and Jira URL.", 502);
  }

  if (response.ok) {
    try {
      return await response.json();
    } catch {
      throw new JiraError("Jira returned an unreadable response.", 502);
    }
  }
  if (response.status === 401) throw new JiraError("Jira rejected the configured credentials.", 502);
  if (response.status === 403) throw new JiraError("The configured Jira account cannot access this resource.", 403);
  if (response.status === 404) throw new JiraError("The Jira issue was not found or is not visible to this account.", 404);
  if (response.status === 429) throw new JiraError("Jira rate limited this request. Try again shortly.", 429);
  if (response.status === 400) throw new JiraError("Jira rejected the search request. Check the project or Epic key and access.", 400);
  throw new JiraError(`Jira returned an unexpected response (${response.status}).`, 502);
}

function requireJiraConfig(config) {
  if (config.jira.missing.length) {
    throw new JiraError(`Missing Jira configuration: ${config.jira.missing.join(", ")}.`, 503);
  }
}

async function getAcceptanceFields(config, fetchImpl) {
  const fields = await jiraRequest("/rest/api/3/field", config, fetchImpl);
  const acceptanceFields = Array.isArray(fields)
    ? fields.filter((field) => /acceptance criteria/i.test(field.name || ""))
    : [];
  return {
    ids: acceptanceFields.map((field) => field.id).filter(Boolean),
    names: Object.fromEntries(acceptanceFields.filter((field) => field.id).map((field) => [field.id, field.name]))
  };
}

function requestedFields(acceptanceFields) {
  return [...new Set([...BASE_FIELDS, ...acceptanceFields.ids])].join(",");
}

async function fetchIssue(issueKey, config, fetchImpl, acceptanceFields) {
  const query = new URLSearchParams({ fields: requestedFields(acceptanceFields), expand: "names" });
  const raw = await jiraRequest(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?${query}`, config, fetchImpl);
  return { ...raw, names: { ...acceptanceFields.names, ...(raw.names || {}) } };
}

export async function testJiraConnection(config, fetchImpl = fetch) {
  requireJiraConfig(config);
  await jiraRequest("/rest/api/3/myself", config, fetchImpl);
  return { message: "Jira connection successful." };
}

export async function searchJiraIssues(jql, config, fetchImpl = fetch, acceptanceFields = { ids: [], names: {} }) {
  requireJiraConfig(config);
  const issues = [];
  let nextPageToken = "";
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    const query = new URLSearchParams({
      jql,
      maxResults: String(PAGE_SIZE),
      fields: requestedFields(acceptanceFields),
      expand: "names"
    });
    if (nextPageToken) query.set("nextPageToken", nextPageToken);

    const page = await jiraRequest(`/rest/api/3/search/jql?${query}`, config, fetchImpl);
    pageCount += 1;
    for (const issue of page.issues || []) {
      issues.push({ ...issue, names: { ...acceptanceFields.names, ...(page.names || {}), ...(issue.names || {}) } });
    }
    if (page.isLast === true || (!page.nextPageToken && page.isLast !== false)) {
      return { issues, pageCount };
    }
    if (!page.nextPageToken) {
      throw new JiraError("Jira indicated more results but did not return a pagination token.", 502);
    }
    nextPageToken = page.nextPageToken;
  }

  throw new JiraError(`Jira search exceeded the ${MAX_PAGES * PAGE_SIZE}-issue safety limit. Narrow the Epic or project selection.`, 413);
}

function normalizeIssue(raw, sourceRole, baseUrl) {
  const fields = raw.fields || {};
  const names = raw.names || {};
  const acceptanceCriteria = Object.entries(names)
    .filter(([, name]) => /acceptance criteria/i.test(name))
    .map(([id, name]) => ({ name, text: jiraValueToText(fields[id]) }))
    .filter((item) => item.text);
  const links = (fields.issuelinks || []).flatMap((link) => {
    const result = [];
    if (link.inwardIssue?.key) {
      result.push({
        key: link.inwardIssue.key,
        relationship: link.type?.inward || link.type?.name || "linked"
      });
    }
    if (link.outwardIssue?.key) {
      result.push({
        key: link.outwardIssue.key,
        relationship: link.type?.outward || link.type?.name || "linked"
      });
    }
    return result;
  });

  return {
    key: raw.key,
    title: fields.summary || "",
    issueType: fields.issuetype?.name || "",
    status: fields.status?.name || "",
    priority: fields.priority?.name || "",
    description: jiraValueToText(fields.description).slice(0, 8000),
    acceptanceCriteria,
    environment: jiraValueToText(fields.environment).slice(0, 2000),
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    components: Array.isArray(fields.components) ? fields.components.map((component) => component.name).filter(Boolean) : [],
    parentKey: fields.parent?.key || "",
    links: unique(links.map((link) => JSON.stringify(link))).map((link) => JSON.parse(link)),
    sourceRole,
    sourceUrl: `${baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(raw.key)}`
  };
}

async function fetchOptionalRelatedIssues(rawIssues, issueMap, config, fetchImpl, acceptanceFields) {
  const references = [];
  for (const raw of rawIssues) {
    const fields = raw.fields || {};
    if (fields.parent?.key && !issueMap.has(fields.parent.key)) {
      references.push({ key: fields.parent.key, sourceRole: "parent" });
    }
    for (const link of fields.issuelinks || []) {
      for (const linked of [link.inwardIssue, link.outwardIssue]) {
        if (linked?.key && !issueMap.has(linked.key)) {
          references.push({ key: linked.key, sourceRole: "linked" });
        }
      }
    }
  }

  const distinct = [...new Map(references.map((item) => [item.key, item])).values()]
    .filter((item) => !issueMap.has(item.key));
  const omitted = Math.max(0, distinct.length - MAX_RELATED_ISSUES);

  for (let index = 0; index < distinct.length - omitted; index += 8) {
    const batch = distinct.slice(index, Math.min(index + 8, distinct.length - omitted));
    const fetched = await Promise.all(batch.map(async (reference) => {
      try {
        return { reference, raw: await fetchIssue(reference.key, config, fetchImpl, acceptanceFields) };
      } catch (error) {
        if (error instanceof JiraError && [403, 404].includes(error.status)) return { reference, raw: null };
        throw error;
      }
    }));
    for (const item of fetched) {
      if (item.raw) issueMap.set(item.raw.key, { raw: item.raw, sourceRole: item.reference.sourceRole });
    }
  }
  return omitted;
}

export async function retrieveRequirements(input, config, fetchImpl = fetch) {
  requireJiraConfig(config);
  const query = normalizeJiraInput(input);
  const acceptanceFields = await getAcceptanceFields(config, fetchImpl);
  const issueMap = new Map();
  const requestedIssues = [];
  const pageCounts = [];

  for (const key of query.issueKeys) {
    const raw = await fetchIssue(key, config, fetchImpl, acceptanceFields);
    issueMap.set(raw.key, { raw, sourceRole: "selected" });
    requestedIssues.push(raw);
  }

  for (const key of query.epicKeys) {
    if (!issueMap.has(key)) {
      const raw = await fetchIssue(key, config, fetchImpl, acceptanceFields);
      issueMap.set(raw.key, { raw, sourceRole: "selected epic" });
      requestedIssues.push(raw);
    }
    const search = await searchJiraIssues(
      `parent = "${key}" OR "Epic Link" = "${key}" ORDER BY key ASC`,
      config,
      fetchImpl,
      acceptanceFields
    );
    pageCounts.push(search.pageCount);
    for (const raw of search.issues) {
      if (!issueMap.has(raw.key)) issueMap.set(raw.key, { raw, sourceRole: `child of ${key}` });
    }
  }

  if (query.projectKey) {
    const search = await searchJiraIssues(
      `project = "${query.projectKey}" ORDER BY key ASC`,
      config,
      fetchImpl,
      acceptanceFields
    );
    pageCounts.push(search.pageCount);
    for (const raw of search.issues) {
      if (!issueMap.has(raw.key)) issueMap.set(raw.key, { raw, sourceRole: `project ${query.projectKey}` });
    }
  }

  const omittedRelatedIssues = await fetchOptionalRelatedIssues(requestedIssues, issueMap, config, fetchImpl, acceptanceFields);
  const normalizedIssues = [...issueMap.values()]
    .map(({ raw, sourceRole }) => normalizeIssue(
      { ...raw, names: { ...acceptanceFields.names, ...(raw.names || {}) } },
      sourceRole,
      config.jira.baseUrl
    ))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    selection: query,
    issues: normalizedIssues,
    counts: {
      issues: normalizedIssues.length,
      searchPages: pageCounts.reduce((sum, count) => sum + count, 0)
    },
    warnings: omittedRelatedIssues
      ? [`${omittedRelatedIssues} linked/parent issue detail(s) were omitted after the ${MAX_RELATED_ISSUES}-issue safety limit; issue link references are retained.`]
      : []
  };
}
