import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers }
    });
  } catch {
    throw new Error("Cannot reach the local backend. Check that the server is running.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function StatusMessage({ result, error }) {
  if (error) return <p className="notice error" role="alert">{error}</p>;
  if (result) return <p className="notice success" role="status">{result}</p>;
  return null;
}

function App() {
  const [page, setPage] = useState("generator");
  const [issueKey, setIssueKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [configuration, setConfiguration] = useState(null);
  const [checking, setChecking] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    apiRequest("/api/config")
      .then(setConfiguration)
      .catch((requestError) => setConnectionError(requestError.message));
  }, []);

  async function generate(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const plan = await apiRequest("/api/generate", {
        method: "POST",
        body: JSON.stringify({ issueKey })
      });
      setResult(plan);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection(kind) {
    if (checking) return;
    setChecking(kind);
    setConnectionMessage("");
    setConnectionError("");
    try {
      const endpoint = kind === "jira" ? "/api/jira/test" : "/api/llm/test";
      const body = kind === "jira" ? {} : { provider: kind };
      const result = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });
      setConnectionMessage(result.message);
    } catch (requestError) {
      setConnectionError(requestError.message);
    } finally {
      setChecking("");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setPage("generator")}>
          <span className="brand-mark">TP</span>
          <span>Test Plan Studio</span>
        </a>
        <nav aria-label="Main navigation">
          <button className={page === "generator" ? "nav-link active" : "nav-link"} onClick={() => setPage("generator")}>
            Generator
          </button>
          <button className={page === "settings" ? "nav-link active" : "nav-link"} onClick={() => setPage("settings")}>
            Settings
          </button>
        </nav>
      </header>

      <main className="page-content">
        {page === "generator" ? (
          <section className="generator-layout">
            <div className="intro">
              <span className="eyebrow">QA WORKSPACE</span>
              <h1>Turn a Jira issue into a test plan.</h1>
              <p>Review requirements, identify gaps, and get a structured draft ready for human review.</p>
            </div>

            <form className="issue-form card" onSubmit={generate}>
              <label htmlFor="issue-key">Jira issue key</label>
              <div className="input-row">
                <input
                  id="issue-key"
                  autoComplete="off"
                  placeholder="e.g. QA-123"
                  value={issueKey}
                  onChange={(event) => setIssueKey(event.target.value)}
                  disabled={loading}
                />
                <button className="primary-button" type="submit" disabled={loading || !issueKey.trim()}>
                  {loading ? <><span className="spinner" /> Generating</> : "Generate test plan"}
                </button>
              </div>
              <p className="field-hint">The issue is read from Jira using server-side credentials.</p>
            </form>

            {loading && <div className="loading-card card" role="status"><span className="spinner" /> Retrieving issue and drafting your plan…</div>}
            <StatusMessage error={error} />

            {result && (
              <section className="result-card card" aria-live="polite">
                <div className="result-heading">
                  <div>
                    <span className="eyebrow">DRAFT FOR REVIEW</span>
                    <h2>{result.issueKey} test plan</h2>
                  </div>
                  <a className="source-link" href={result.sourceUrl} target="_blank" rel="noreferrer">View Jira issue ↗</a>
                </div>
                <div className="plan-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.testPlan}</ReactMarkdown>
                </div>
                <p className="model-note">Draft generated with {result.provider}. Review all assumptions and open questions before use.</p>
              </section>
            )}
          </section>
        ) : (
          <Settings
            configuration={configuration}
            checking={checking}
            message={connectionMessage}
            error={connectionError}
            onTest={testConnection}
          />
        )}
      </main>
      <footer>Generated plans are drafts and require QA review.</footer>
    </div>
  );
}

function Settings({ configuration, checking, message, error, onTest }) {
  if (!configuration) {
    return <section className="settings-layout"><div className="intro"><span className="eyebrow">CONFIGURATION</span><h1>Settings</h1></div><StatusMessage error={error || "Loading server configuration…"} /></section>;
  }

  const jira = configuration.jira;
  const providers = configuration.providers;

  return (
    <section className="settings-layout">
      <div className="intro">
        <span className="eyebrow">CONFIGURATION</span>
        <h1>Settings</h1>
        <p>Connections are read from the backend environment. Credentials are never sent back to this page.</p>
      </div>
      <StatusMessage result={message} error={error} />

      <div className="settings-grid">
        <section className="settings-card card">
          <div className="card-title-row">
            <div><span className="card-icon">↗</span><h2>Jira connection</h2></div>
            <span className={jira.configured ? "status-pill ready" : "status-pill missing"}>{jira.configured ? "Configured" : "Needs setup"}</span>
          </div>
          <dl className="config-list">
            <div><dt>Base URL</dt><dd>{jira.baseUrl || "Not configured"}</dd></div>
            <div><dt>Email</dt><dd>{jira.email || "Not configured"}</dd></div>
            <div><dt>API token</dt><dd>{jira.tokenConfigured ? "••••••••••••" : "Not configured"}</dd></div>
          </dl>
          {jira.missing.length > 0 && <p className="field-hint">Missing: {jira.missing.join(", ")}</p>}
          <button className="secondary-button" onClick={() => onTest("jira")} disabled={Boolean(checking)}>
            {checking === "jira" ? "Testing…" : "Test Jira connection"}
          </button>
        </section>

        <section className="settings-card card">
          <div className="card-title-row">
            <div><span className="card-icon">✦</span><h2>LLM configuration</h2></div>
          </div>
          <ProviderStatus name="ollama" label="Ollama local" provider={providers.ollama} checking={checking} onTest={onTest} />
          <ProviderStatus name="groq" label="Groq.com" provider={providers.groq} checking={checking} onTest={onTest} />
          {configuration.providerError && <p className="field-hint">{configuration.providerError}</p>}
          {!configuration.activeProvider && !configuration.providerError && <p className="field-hint">No complete provider configuration found. Set a provider and model in `.env`.</p>}
        </section>
      </div>
    </section>
  );
}

function ProviderStatus({ name, label, provider, checking, onTest }) {
  return (
    <div className="provider-row">
      <div className="provider-info">
        <div className="provider-name">{label}<span className={provider.configured ? "status-dot ready" : "status-dot"} /></div>
        <div className="provider-detail">{provider.configured ? provider.model : `Missing: ${provider.missing.join(", ")}`}</div>
      </div>
      <button className="text-button" onClick={() => onTest(name)} disabled={Boolean(checking) || !provider.configured}>
        {checking === name ? "Testing…" : "Test"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
