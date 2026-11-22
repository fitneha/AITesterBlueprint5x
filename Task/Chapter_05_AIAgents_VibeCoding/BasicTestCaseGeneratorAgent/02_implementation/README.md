# AI-Powered Test Case Generator

A private, local QA workspace that combines Jira issues, authorized document links, uploaded requirements, and manual notes. It previews retrieved source content before generating an editable, traceable test-case draft and a separate QA analysis.

## Requirements and setup

- Node.js 20 or newer.
- Jira Cloud access for Jira and Confluence sources.
- One configured model provider: Groq or Ollama.
- Optional authorized document-provider access tokens.

From this directory in PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). The backend listens on `http://127.0.0.1:3003`.

The backend searches upward from `src/backend` for `.env` and loads the repository-root `.env` if present. It does not copy or expose credentials to the browser. Environment variables already set by the process take precedence.

### Model provider

Configure one provider:

```text
LLM_PROVIDER=groq
GROQ_API_KEY=your-key
GROQ_MODEL=your-model
```

Or:

```text
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=your-installed-model
```

If both providers are configured, `LLM_PROVIDER` is required. The application does not choose a provider or model for you.

If generation reports a Groq `429`, Groq rejected the request because an account rate limit or usage quota was reached. Wait for a limit reset, reduce the amount of source content and retry, or check Groq Console for the model's limits and your account usage. The error includes Groq's explanation when available. Alternatively, configure Ollama and select it as the active provider.

### Jira and document sources

Jira and Confluence use:

```text
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_TOKEN=your-jira-api-token
```

Optional connectors:

```text
GOOGLE_ACCESS_TOKEN=authorized-google-access-token
NOTION_TOKEN=authorized-notion-integration-token
MS_GRAPH_ACCESS_TOKEN=authorized-microsoft-graph-access-token
DOCUMENT_ALLOWED_HOSTS=docs.example.com,requirements.example.net
```

Tokens must have access to the selected source. Google/Graph access tokens may expire and need to be refreshed outside this application. Public document links are fetched only over HTTPS, only from explicitly allowlisted hosts, without following redirects. Private/local IPs and hosts are rejected. Private sources that cannot be retrieved can be pasted or uploaded instead.

The backend uses `AI_TEST_CASE_GENERATOR_PORT` (default `3003`) so it does not collide with sibling apps that use the generic `PORT` variable.

## Use

1. Provide one or more Jira issue/Epic keys, HTTPS document URLs, manual requirements, or uploaded files. Sources can be combined; Jira is not required.
2. Select **Preview sources**. The app retrieves and displays content/status before sending it to the model.
3. Optionally set a desired case-count target (1–100) and source precedence. Targets do not override relevant coverage; material conflicts remain visible even when a precedence is selected. Generated suites are capped at 100 cases.
4. Review the source inventory and warnings, then select **Generate test cases**.
5. Edit or selectively regenerate test cases. Review the template output, coverage, risks, source traceability, ambiguities, and independent QA findings.
6. Export the test-case table or QA report as Markdown, CSV, or Excel. Jira CSV export requires a project key and issue type; it prepares an import file but does not create Jira issues.
7. Explicitly approve the draft only after QA review. Approval is local to the current in-memory draft and does not publish to Jira.

### Template

`Template1_Basic_TC_Gen.md` is the default authoritative test-case format. It preserves these columns and their order:

1. Test ID
2. Description
3. Pre-conditions
4. Steps
5. Expected Result
6. Priority

An alternate Markdown template can be uploaded if it contains the same six column names in the same order. Unsupported or incompatible templates fail validation rather than being silently replaced.

### Uploaded files

Supported: PDF, DOC, DOCX, TXT, Markdown, CSV, and XLSX. The default limit is 8 MB per file and five requirement files per request; set `MAX_UPLOAD_MB` (up to 50 MB) to adjust the per-file limit. Extracted content is capped at 50,000 characters per source and 100,000 characters across a request. Large requests over these limits are rejected with an actionable message; background job processing is not included. Files are parsed in memory and are not persisted. No malware scanning service is bundled, so only upload files from trusted sources.

Generic public links support HTML, plain text, or PDF. The Google Docs, Notion, SharePoint, and Confluence connectors use their supported APIs and configured access tokens. Redirects from generic public links are rejected to prevent fetching an unreviewed host.

## Draft, storage, and access limitations

- All outputs remain drafts until the reviewer explicitly approves them. The generator does not create Jira issues.
- Drafts and source text are kept in process memory for at most 60 minutes and are removed when the server restarts. No database or multi-user history is configured.
- The server binds to loopback (`127.0.0.1`) and has no in-app login or role-based access controls. Do not expose it directly to a network or deploy it publicly. A shared deployment requires private access protection and a separate authentication/authorization layer.
- Jira attachment metadata is included, but Jira attachment binaries are not downloaded. Document retrieval honors provider access and reports failed sources instead of claiming they were read.
- Notion page retrieval currently reads the first page of top-level blocks. Large/deeply nested content may be incomplete and is reported only to the extent exposed by the API response.
- Uploaded `.doc` extraction and document parsing happen in-process. Malware scanning and asynchronous job processing require separate infrastructure.
- Exports and generated language can vary by model. Review the test steps, priorities, assumptions, and expected results before execution.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

Tests use local fixtures and mocked Jira/model responses. Live integration checks require authorized credentials and are available from the Settings view.
