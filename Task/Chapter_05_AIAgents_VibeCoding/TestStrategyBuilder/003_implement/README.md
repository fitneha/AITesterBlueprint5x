# AI-Powered Test Strategy Builder

A lightweight React and Express application that retrieves Jira requirements, presents an AI-assisted requirement analysis for review, then generates and validates a test strategy using the supplied Markdown template.

## Requirements and setup

- Node.js 20 or newer
- Jira Cloud access to the selected issues
- A Groq model/API key or a reachable Ollama model

From this directory:

```powershell
npm install
```

Create a local `.env` with the Jira and model-provider values below. The backend searches upward from `src/backend` for `.env`, so it can also use the existing parent `.env`. Process environment variables take precedence. Secrets are read only by the backend and are never returned to the frontend. `.env` is git-ignored; do not commit it.

Jira values:

```text
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_TOKEN=your-jira-api-token
```

Groq:

```text
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=your-model-name
```

Or Ollama:

```text
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=your-installed-model-name
```

If both providers are configured, set `LLM_PROVIDER`. The app does not select a model for you.
Groq's `openai/gpt-oss-20b` and `openai/gpt-oss-120b` models use strict JSON Schema responses. Ollama receives the response schema directly; other Groq models get one correction retry if their output is not valid JSON.

## Run locally

```powershell
npm.cmd run dev
```

Open the Vite URL shown in the terminal. The backend uses port `3002` by default; set `TEST_STRATEGY_PORT` to change it.

For a production build:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

## Deploy to Vercel

The Express app is exposed from `src/server.js`, and `npm run build` writes the frontend into `public/`, which Vercel serves as static assets. Vercel environment variables must be configured in the project settings; the local `.env` file is not deployed.

Before deploying, enable Vercel Deployment Protection for production and preview deployments. This app has no application login and its API uses Jira and model-provider credentials, so do not make it publicly accessible. Add `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_TOKEN`, `LLM_PROVIDER`, `GROQ_API_KEY`, and `GROQ_MODEL` as Vercel environment variables. If using Ollama, its URL must be reachable from Vercel; `localhost` refers to the Vercel function environment, not your computer.

After authenticating with `npx vercel login`, run `npx vercel` from this directory to create/link the project. Set the environment variables and confirm access protection in the Vercel dashboard before deploying production with `npx vercel --prod`. The default domain uses `.vercel.app` (for example, `teststrategybuilder.vercel.app`, if available).

## Use

1. Enter one or more issue keys, optional Epic keys, or a Jira project key.
2. Select **Analyze requirements**. The app retrieves issues and displays confirmed, inferred, missing, and risk information.
3. Review the analysis, then generate the strategy.
4. Preview or edit the strategy, regenerate an individual section, and download the strategy, analysis, or validation report as Markdown.

Epic and project searches use Jira pagination, with a 10,000-issue safety limit. Up to 100 linked/parent issue details are fetched; additional issue links remain listed and the UI displays a warning. A model context-limit error asks you to narrow the selection. Comments and attachments are not fetched because they are not needed for this workflow. Acceptance criteria are extracted when Jira exposes a matching field name.

## Template and limitations

The generated strategy preserves the supplied `test_strategy_template.md` headings and order. The prompt also describes a separate 24-section outline; the actual supplied template has 8 numbered sections and is treated as authoritative. Jira traceability and generated document metadata are included within its existing sections.

The optional PDF export is not included. Outputs are AI-generated drafts that require QA Lead and Engineering/Product review. Varying models may produce different wording despite temperature-zero settings. The app uses the Jira Cloud REST API v3; other Jira deployments may need changes.

## Verification

- `npm test` covers input validation, Jira field/ADF normalization, paginated searches, template structure, and mocked AI interactions.
- `npm run build` verifies the frontend bundle.
- Tests use mocks; live Jira and model-provider calls are not part of the test suite.
