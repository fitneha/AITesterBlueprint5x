export class JiraError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

export function validateIssueKey(issueKey) {
  return typeof issueKey === "string" && /^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey.trim());
}

export function jiraValueToText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(jiraValueToText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (Array.isArray(value.content)) return jiraValueToText(value.content);
  return Object.values(value).map(jiraValueToText).filter(Boolean).join("\n");
}

async function jiraRequest(path, config, fetchImpl = fetch) {
  const baseUrl = config.jira.baseUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.jira.email}:${config.jira.token}`).toString("base64")}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new JiraError("Jira did not respond in time. Try again later.", 504);
    }
    throw new JiraError("Could not reach Jira. Check the server network and Jira URL.", 502);
  }

  if (response.ok) return response.json();
  if (response.status === 401) throw new JiraError("Jira rejected the configured credentials.", 502);
  if (response.status === 403) throw new JiraError("The configured Jira account cannot access this resource.", 502);
  if (response.status === 404) throw new JiraError("The Jira issue was not found or is not visible to this account.", 404);
  if (response.status === 429) throw new JiraError("Jira rate limited this request. Try again shortly.", 429);
  throw new JiraError(`Jira returned an unexpected response (${response.status}).`, 502);
}

export async function testJiraConnection(config, fetchImpl = fetch) {
  if (config.jira.missing.length) {
    throw new JiraError(`Missing Jira configuration: ${config.jira.missing.join(", ")}.`, 400);
  }
  await jiraRequest("/rest/api/3/myself", config, fetchImpl);
  return { message: "Jira connection successful." };
}

export async function getJiraIssue(issueKey, config, fetchImpl = fetch) {
  if (!validateIssueKey(issueKey)) {
    throw new JiraError("Enter a valid Jira issue key, such as QA-123.", 400);
  }
  if (config.jira.missing.length) {
    throw new JiraError(`Missing Jira configuration: ${config.jira.missing.join(", ")}.`, 503);
  }

  const key = issueKey.trim().toUpperCase();
  const query = new URLSearchParams({ fields: "*all", expand: "names" });
  const data = await jiraRequest(`/rest/api/3/issue/${encodeURIComponent(key)}?${query}`, config, fetchImpl);
  const fields = data.fields || {};
  const names = data.names || {};
  const acceptanceCriteria = Object.entries(names)
    .filter(([, name]) => /acceptance criteria/i.test(name))
    .map(([id, name]) => ({ name, value: jiraValueToText(fields[id]) }))
    .filter((field) => field.value);

  const issue = {
    key: data.key || key,
    title: fields.summary || "",
    type: fields.issuetype?.name || "",
    status: fields.status?.name || "",
    description: jiraValueToText(fields.description),
    acceptanceCriteria,
    environment: jiraValueToText(fields.environment),
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    components: Array.isArray(fields.components) ? fields.components.map((item) => item.name).filter(Boolean) : [],
    sourceUrl: `${config.jira.baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(data.key || key)}`
  };

  return issue;
}
