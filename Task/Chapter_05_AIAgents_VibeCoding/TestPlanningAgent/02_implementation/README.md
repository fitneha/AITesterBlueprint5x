# Jira Test Plan Generator

A small React UI and Express API for retrieving a Jira issue and drafting a test plan from the supplied template. The plan is always a draft for human review.

## Requirements and installation

- Node.js 20 or newer
- Jira Cloud account with read access to the target issues
- A configured Groq API key and model, or a reachable Ollama server and model

From this directory:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with your own Jira and model-provider settings. The backend loads the first `.env` it finds while searching upward from `src/backend`, so a file in this directory or any parent directory works. Environment variables already set by the process take precedence. Never put real credentials in source control.

Required Jira values:

```text
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_TOKEN=your-jira-api-token
```

Choose and configure a model provider:

```text
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=your-model-name
```

Or use Ollama:

```text
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=your-installed-model-name
```

If both providers are configured, `LLM_PROVIDER` is required. This app does not select a model or provider on your behalf.

## Run

```powershell
npm run dev
```

Open the local URL printed by Vite. For a production build:

```powershell
npm run build
npm start
```

The backend listens on port `3001` by default; set `PORT` to change it.

## Deploy to Vercel

The Express entry point is `src/server.js`; `npm run build` generates the frontend assets in `public/`, which Vercel serves as static files.

**Protect the deployment before adding Jira or AI credentials.** The app does not implement user sign-in, so an unprotected deployment would allow visitors to call its Jira and model APIs. Enable Vercel Deployment Protection or equivalent access control and keep the deployment private.

1. Run `npm run build` locally to check the deployment build.
2. From this directory, authenticate with your own Vercel account using `npx vercel`.
3. Add the Jira and model-provider variables listed above in the Vercel project's **Settings → Environment Variables**. Keep them server-side; do not add them to the frontend or commit them.
4. Deploy with `npx vercel --prod`.

The deploy command may prompt you to link a Vercel project. Do not paste access tokens into chat or source files.

## Use

1. Enter a Jira issue key such as `QA-123` and choose **Generate test plan**.
2. The backend reads the issue, then asks the configured model to fill the supplied template.
3. Review the draft, its Jira source link, gaps, and questions before using it.
4. Open **Settings** to test the Jira and configured model-provider connections.

The Settings page reports which values are configured and offers connection tests; it never returns API tokens or model keys to the browser. Change credentials in `.env` and restart the backend.

## Verification and limitations

- `npm test` covers issue-key validation, Jira description/acceptance-criteria extraction, template-heading validation, and mocked Jira/model request behavior.
- `npm run build` checks the React production build.
- A local smoke test verified frontend serving, configuration status, invalid-key rejection, and the missing-configuration error paths.
- Vercel deployment itself was not run from this workspace; deploy using your own Vercel login after setting the server-side environment variables.
- Live Jira and model-provider calls require valid credentials, network access, and issue permissions. They are not represented as verified unless tested against your own configuration.
- No `.env` file was present during implementation, so live Jira/model connectivity was not tested.
- The AI-generated plan can vary by provider/model despite deterministic generation settings; it must be reviewed by a QA owner.
- Jira acceptance-criteria fields are found when Jira exposes their field names in the issue response. If criteria or other details are absent, the plan must state **“Insufficient information to determine.”**
- The project uses the Jira Cloud REST API v3. Other Jira deployment types may need a compatible API endpoint.
