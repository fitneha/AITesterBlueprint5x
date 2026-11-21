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

function splitKeys(value) {
  return value.split(/[,\s]+/).map((key) => key.trim()).filter(Boolean);
}

function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StatusMessage({ message, error }) {
  if (error) return <p className="notice error" role="alert">{error}</p>;
  if (message) return <p className="notice success" role="status">{message}</p>;
  return null;
}

function App() {
  const [page, setPage] = useState("builder");
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [jiraKeys, setJiraKeys] = useState("");
  const [epicKeys, setEpicKeys] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [strategyResult, setStrategyResult] = useState(null);
  const [activeDocument, setActiveDocument] = useState("analysis");
  const [editMode, setEditMode] = useState(false);
  const [sectionToRegenerate, setSectionToRegenerate] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest("/api/config")
      .then(setConfig)
      .catch((requestError) => setConfigError(requestError.message));
  }, []);

  async function analyze(event) {
    event.preventDefault();
    if (busy) return;
    const request = {
      issueKeys: splitKeys(jiraKeys),
      epicKeys: splitKeys(epicKeys),
      projectKey: projectKey.trim()
    };
    if (!request.issueKeys.length && !request.epicKeys.length && !request.projectKey) {
      setError("Enter one or more Jira issue keys, an Epic key, or a project key.");
      return;
    }

    setBusy("analysis");
    setError("");
    setMessage("");
    setAnalysisResult(null);
    setStrategyResult(null);
    setEditMode(false);
    try {
      const result = await apiRequest("/api/analyze", {
        method: "POST",
        body: JSON.stringify(request)
      });
      setAnalysisResult(result);
      setActiveDocument("analysis");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function generateStrategy() {
    if (!analysisResult || busy) return;
    setBusy("strategy");
    setError("");
    setMessage("");
    try {
      const result = await apiRequest("/api/strategy/generate", {
        method: "POST",
        body: JSON.stringify({
          sources: analysisResult.sources,
          analysis: analysisResult.analysis
        })
      });
      setStrategyResult(result);
      setActiveDocument("strategy");
      setSectionToRegenerate(result.sections[0] || "");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function regenerateSection() {
    if (!analysisResult || !strategyResult || !sectionToRegenerate || busy) return;
    setBusy("section");
    setError("");
    setMessage("");
    try {
      const result = await apiRequest("/api/strategy/regenerate-section", {
        method: "POST",
        body: JSON.stringify({
          sources: analysisResult.sources,
          analysis: analysisResult.analysis,
          heading: sectionToRegenerate,
          currentMarkdown: strategyResult.strategyMarkdown
        })
      });
      setStrategyResult((current) => ({ ...current, strategyMarkdown: result.strategyMarkdown }));
      setMessage(`${sectionToRegenerate} regenerated. Review the updated section.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function testConnection(connection) {
    if (busy) return;
    setBusy(connection);
    setError("");
    setMessage("");
    try {
      const endpoint = connection === "jira" ? "/api/jira/test" : "/api/llm/test";
      const body = connection === "jira" ? {} : { provider: connection };
      const result = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  function updateStrategy(text) {
    setStrategyResult((current) => ({ ...current, strategyMarkdown: text }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage("builder"); }}>
          <span className="brand-mark">TS</span>
          <span>Strategy Builder</span>
        </a>
        <nav aria-label="Main navigation">
          <button className={page === "builder" ? "nav-link active" : "nav-link"} onClick={() => setPage("builder")}>Builder</button>
          <button className={page === "settings" ? "nav-link active" : "nav-link"} onClick={() => setPage("settings")}>Connections</button>
        </nav>
      </header>

      <main className="page-content">
        {page === "builder" ? (
          <Builder
            jiraKeys={jiraKeys}
            epicKeys={epicKeys}
            projectKey={projectKey}
            setJiraKeys={setJiraKeys}
            setEpicKeys={setEpicKeys}
            setProjectKey={setProjectKey}
            analysisResult={analysisResult}
            strategyResult={strategyResult}
            activeDocument={activeDocument}
            setActiveDocument={setActiveDocument}
            editMode={editMode}
            setEditMode={setEditMode}
            sectionToRegenerate={sectionToRegenerate}
            setSectionToRegenerate={setSectionToRegenerate}
            busy={busy}
            error={error}
            message={message}
            onAnalyze={analyze}
            onGenerate={generateStrategy}
            onRegenerate={regenerateSection}
            onUpdateStrategy={updateStrategy}
          />
        ) : (
          <Connections
            config={config}
            configError={configError}
            busy={busy}
            error={error}
            message={message}
            onTest={testConnection}
          />
        )}
      </main>
      <footer>AI-generated strategy drafts require QA, Engineering, and Product review.</footer>
    </div>
  );
}

function Builder(props) {
  const {
    jiraKeys, epicKeys, projectKey, setJiraKeys, setEpicKeys, setProjectKey,
    analysisResult, strategyResult, activeDocument, setActiveDocument,
    editMode, setEditMode, sectionToRegenerate, setSectionToRegenerate,
    busy, error, message, onAnalyze, onGenerate, onRegenerate, onUpdateStrategy
  } = props;

  return (
    <section className="builder-layout">
      <div className="intro">
        <span className="eyebrow">QA ARCHITECTURE WORKSPACE</span>
        <h1>AI-Powered Test Strategy Builder</h1>
        <p>Review Jira requirements first, then create a traceable test strategy from the supplied template.</p>
      </div>

      <form className="input-card card" onSubmit={onAnalyze}>
        <div className="card-heading">
          <div><span className="step-number">1</span><h2>Jira requirements</h2></div>
          {analysisResult && <span className="status-pill ready">{analysisResult.sources.counts.issues} issues analyzed</span>}
        </div>
        <div className="input-grid">
          <label className="field wide">
            <span>Issue keys <span className="optional">multiple allowed</span></span>
            <textarea rows="2" placeholder="e.g. IAM-1001, IAM-1002" value={jiraKeys} onChange={(event) => setJiraKeys(event.target.value)} />
            <small>Separate issue keys with commas, spaces, or new lines.</small>
          </label>
          <label className="field">
            <span>Epic keys <span className="optional">optional</span></span>
            <input placeholder="e.g. IAM-1000" value={epicKeys} onChange={(event) => setEpicKeys(event.target.value)} />
            <small>Child issues are retrieved with pagination.</small>
          </label>
          <label className="field">
            <span>Project key <span className="optional">optional</span></span>
            <input placeholder="e.g. IAM" value={projectKey} onChange={(event) => setProjectKey(event.target.value)} />
            <small>Retrieves issues visible to the configured Jira account.</small>
          </label>
        </div>
        <div className="form-footer">
          <span className="connection-inline"><span className={analysisResult ? "status-dot ready" : "status-dot"} />{analysisResult ? "Requirements ready for review" : "Jira credentials stay on the backend"}</span>
          <button className="primary-button" type="submit" disabled={Boolean(busy)}>
            {busy === "analysis" ? <><span className="spinner" /> Analyzing</> : "Analyze requirements"}
          </button>
        </div>
      </form>

      <StatusMessage error={error} message={message} />

      {busy === "analysis" && <div className="loading-card card" role="status"><span className="spinner" />Retrieving Jira issues and analyzing requirements…</div>}

      {analysisResult && (
        <section className="result-card card">
          <div className="result-title-row">
            <div>
              <span className="eyebrow">REQUIREMENT REVIEW</span>
              <h2>Review findings before strategy generation</h2>
              <p>{analysisResult.sources.counts.issues} source issues · analyzed with {analysisResult.provider}</p>
            </div>
            <button className="secondary-button" onClick={onGenerate} disabled={Boolean(busy)}>
              {busy === "strategy" ? <><span className="spinner" /> Generating</> : strategyResult ? "Regenerate strategy" : "Generate test strategy"}
            </button>
          </div>

          <div className="source-chips">
            {analysisResult.sources.issues.slice(0, 30).map((issue) => (
              <a key={issue.key} href={issue.sourceUrl} target="_blank" rel="noreferrer">{issue.key}</a>
            ))}
            {analysisResult.sources.issues.length > 30 && <span>+{analysisResult.sources.issues.length - 30} more</span>}
          </div>
          {analysisResult.sources.warnings.map((warning) => <p className="notice warning" key={warning}>{warning}</p>)}

          <DocumentTabs
            activeDocument={activeDocument}
            setActiveDocument={setActiveDocument}
            hasStrategy={Boolean(strategyResult)}
          />

          {activeDocument === "analysis" && (
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult.analysisMarkdown}</ReactMarkdown>
            </div>
          )}

          {activeDocument === "strategy" && strategyResult && (
            <div className="strategy-panel">
              <div className="document-actions">
                <div className="section-regenerator">
                  <select value={sectionToRegenerate} onChange={(event) => setSectionToRegenerate(event.target.value)} aria-label="Section to regenerate">
                    {strategyResult.sections.map((heading) => <option key={heading} value={heading}>{heading.replace(/^##\s*/, "")}</option>)}
                  </select>
                  <button className="text-button" onClick={onRegenerate} disabled={Boolean(busy)}>
                    {busy === "section" ? "Regenerating…" : "Regenerate section"}
                  </button>
                </div>
                <button className="text-button" onClick={() => setEditMode(!editMode)}>{editMode ? "Preview" : "Edit"}</button>
                <button className="text-button" onClick={() => downloadMarkdown("TEST_STRATEGY.md", strategyResult.strategyMarkdown)}>Download strategy</button>
              </div>
              {editMode ? (
                <textarea className="markdown-editor" aria-label="Edit test strategy Markdown" value={strategyResult.strategyMarkdown} onChange={(event) => onUpdateStrategy(event.target.value)} />
              ) : (
                <div className="markdown-preview">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{strategyResult.strategyMarkdown}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {activeDocument === "validation" && strategyResult && (
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{strategyResult.validationReport}</ReactMarkdown>
            </div>
          )}

          <div className="download-row">
            <button className="download-button" onClick={() => downloadMarkdown("REQUIREMENT_ANALYSIS.md", analysisResult.analysisMarkdown)}>↓ Requirement analysis</button>
            {strategyResult && <button className="download-button" onClick={() => downloadMarkdown("STRATEGY_VALIDATION_REPORT.md", strategyResult.validationReport)}>↓ Validation report</button>}
          </div>
        </section>
      )}
    </section>
  );
}

function DocumentTabs({ activeDocument, setActiveDocument, hasStrategy }) {
  return (
    <div className="document-tabs" role="tablist" aria-label="Generated documents">
      <button role="tab" aria-selected={activeDocument === "analysis"} className={activeDocument === "analysis" ? "selected" : ""} onClick={() => setActiveDocument("analysis")}>Requirement analysis</button>
      {hasStrategy && <button role="tab" aria-selected={activeDocument === "strategy"} className={activeDocument === "strategy" ? "selected" : ""} onClick={() => setActiveDocument("strategy")}>Test strategy</button>}
      {hasStrategy && <button role="tab" aria-selected={activeDocument === "validation"} className={activeDocument === "validation" ? "selected" : ""} onClick={() => setActiveDocument("validation")}>Validation report</button>}
    </div>
  );
}

function Connections({ config, configError, busy, error, message, onTest }) {
  if (!config) {
    return <section className="settings-layout"><div className="intro"><span className="eyebrow">CONNECTIONS</span><h1>Settings</h1></div><StatusMessage error={configError || "Loading server configuration…"} /></section>;
  }

  return (
    <section className="settings-layout">
      <div className="intro">
        <span className="eyebrow">CONNECTIONS</span>
        <h1>Settings</h1>
        <p>Credentials are loaded from the server environment and are never sent to the browser.</p>
      </div>
      <StatusMessage error={error} message={message} />
      <div className="settings-grid">
        <section className="settings-card card">
          <div className="card-heading">
            <div><span className="step-number">J</span><h2>Jira</h2></div>
            <span className={config.jiraConfigured ? "status-pill ready" : "status-pill missing"}>{config.jiraConfigured ? "Configured" : "Needs setup"}</span>
          </div>
          {!config.jiraConfigured && <p className="field-hint">Missing: {config.jiraMissing.join(", ")}</p>}
          <p className="config-note">Connection credentials are read from `.env` by the backend.</p>
          <button className="secondary-button" onClick={() => onTest("jira")} disabled={Boolean(busy)}>{busy === "jira" ? "Testing…" : "Test Jira connection"}</button>
        </section>

        <section className="settings-card card">
          <div className="card-heading"><div><span className="step-number">AI</span><h2>AI model</h2></div></div>
          <ProviderConnection name="ollama" label="Ollama local" provider={config.providers.ollama} busy={busy} onTest={onTest} />
          <ProviderConnection name="groq" label="Groq" provider={config.providers.groq} busy={busy} onTest={onTest} />
          {config.providerError && <p className="field-hint">{config.providerError}</p>}
          {config.activeProvider && <p className="config-note">Active provider: {config.activeProvider}</p>}
          {!config.activeProvider && !config.providerError && <p className="field-hint">Set one provider and model in `.env`.</p>}
        </section>
      </div>
    </section>
  );
}

function ProviderConnection({ name, label, provider, busy, onTest }) {
  return (
    <div className="provider-row">
      <div className="provider-info">
        <div className="provider-name">{label}<span className={provider.configured ? "status-dot ready" : "status-dot"} /></div>
        <div className="provider-detail">{provider.configured ? provider.model : `Missing: ${provider.missing.join(", ")}`}</div>
      </div>
      <button className="text-button" onClick={() => onTest(name)} disabled={Boolean(busy) || !provider.configured}>
        {busy === name ? "Testing…" : "Test"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
