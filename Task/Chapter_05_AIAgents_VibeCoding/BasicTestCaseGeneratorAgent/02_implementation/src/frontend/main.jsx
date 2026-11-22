import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";

async function api(path, options = {}) {
  let response;
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the local backend. Check that the app is running.");
  }
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => ({})) : await response.blob();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function Status({ error, success }) {
  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (success) return <div className="notice success" role="status">{success}</div>;
  return null;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function App() {
  const [config, setConfig] = useState(null);
  const [template, setTemplate] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState({
    manualText: "",
    issueKeys: "",
    urls: "",
    documents: [],
    templateFile: null,
    testCaseTarget: "",
    sourcePrecedence: "none"
  });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [editedCases, setEditedCases] = useState([]);
  const [tab, setTab] = useState("cases");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [connection, setConnection] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [jiraIssueType, setJiraIssueType] = useState("");

  useEffect(() => {
    Promise.all([api("/api/config"), api("/api/template")])
      .then(([serverConfig, defaultTemplate]) => {
        setConfig(serverConfig);
        setTemplate(defaultTemplate);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  function updateInput(key, value) {
    setInput((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setResult(null);
    setError("");
    setMessage("");
  }

  function buildPreviewForm() {
    const form = new FormData();
    form.append("manualText", input.manualText);
    form.append("issueKeys", input.issueKeys);
    form.append("urls", input.urls);
    form.append("testCaseTarget", input.testCaseTarget);
    form.append("sourcePrecedence", input.sourcePrecedence);
    input.documents.forEach((file) => form.append("documents", file));
    if (input.templateFile) form.append("template", input.templateFile);
    return form;
  }

  async function createPreview(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("preview");
    setError("");
    setMessage("");
    setPreview(null);
    setResult(null);
    try {
      const prepared = await api("/api/preview", { method: "POST", body: buildPreviewForm() });
      setPreview(prepared);
      setMessage("Sources are ready. Review the retrieved content before generating cases.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    if (!preview || busy) return;
    setBusy("generate");
    setError("");
    setMessage("");
    try {
      const generated = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({ previewId: preview.previewId })
      });
      setResult(generated);
      setEditedCases(generated.testCases);
      setTab("cases");
      setMessage("Draft generated and independently reviewed. Human approval is still required.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function saveEdits() {
    if (!result || busy) return;
    setBusy("save");
    setError("");
    try {
      const updated = await api("/api/edit", {
        method: "POST",
        body: JSON.stringify({
          generationId: result.id,
          updates: editedCases.map(({ testId, description, preconditions, steps, expectedResult, priority }) => ({
            testId, description, preconditions, steps, expectedResult, priority
          }))
        })
      });
      setResult(updated);
      setEditedCases(updated.testCases);
      setMessage("Test case edits saved.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function regenerate(testId, instruction) {
    if (!result || busy) return;
    setBusy(`regenerate-${testId}`);
    setError("");
    try {
      const response = await api("/api/regenerate-case", {
        method: "POST",
        body: JSON.stringify({ generationId: result.id, testId, instruction })
      });
      setResult(response.result);
      setEditedCases(response.result.testCases);
      setMessage(`${testId} was regenerated as a draft. Review it before approval.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    if (!result || busy || result.approved) return;
    const confirmed = window.confirm("Mark this AI-generated draft QA approved? This does not publish or create Jira issues.");
    if (!confirmed) return;
    setBusy("approve");
    setError("");
    try {
      const approved = await api("/api/approve", {
        method: "POST",
        body: JSON.stringify({ generationId: result.id })
      });
      setResult(approved);
      setMessage("Draft marked QA approved locally. No Jira issue was created.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function exportResult(format) {
    if (!result || busy) return;
    setBusy(`export-${format}`);
    setError("");
    try {
      const blob = await api("/api/export", {
        method: "POST",
        body: JSON.stringify({
          generationId: result.id,
          format,
          projectKey: jiraProjectKey,
          issueType: jiraIssueType
        })
      });
      const extension = format === "xlsx" ? "xlsx" : format === "report" || format === "markdown" ? "md" : "csv";
      downloadBlob(blob, `qa-test-cases.${extension}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function testConnection(kind) {
    if (busy || connection) return;
    setConnection(kind);
    setError("");
    setMessage("");
    try {
      const response = await api(kind === "jira" ? "/api/jira/test" : "/api/llm/test", {
        method: "POST",
        body: JSON.stringify(kind === "jira" ? {} : { provider: kind })
      });
      setMessage(response.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setConnection("");
    }
  }

  function updateCase(testId, field, value) {
    setEditedCases((current) => current.map((testCase) =>
      testCase.testId === testId ? { ...testCase, [field]: value } : testCase
    ));
  }

  const filteredCases = useMemo(() => editedCases.filter((testCase) => {
    const matchesText = !search || [
      testCase.testId, testCase.description, testCase.steps, testCase.expectedResult,
      ...(testCase.requirementIds || [])
    ].join(" ").toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === "all" || testCase.priority === priorityFilter;
    const matchesType = typeFilter === "all" || testCase.type === typeFilter;
    return matchesText && matchesPriority && matchesType;
  }), [editedCases, search, priorityFilter, typeFilter]);
  const hasUnsavedEdits = Boolean(result && JSON.stringify(editedCases) !== JSON.stringify(result.testCases));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setSettingsOpen(false); }}>
          <span className="brand-mark">QA</span>
          <span>Case Studio</span>
        </a>
        <div className="topbar-actions">
          <span className="private-badge"><span /> Private workspace</span>
          <button className="quiet-button" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? "Generator" : "Settings"}
          </button>
        </div>
      </header>

      <main className="page-content">
        <Status error={error} success={message} />
        {settingsOpen ? (
          <Settings config={config} connection={connection} onTest={testConnection} />
        ) : (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">AI-ASSISTED QUALITY ENGINEERING</span>
                <h1>Turn requirements into <span>test cases.</span></h1>
                <p>Combine Jira, documents, and QA notes. Review the source context before generating a traceable test suite.</p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" /><div className="orbit orbit-two" />
                <div className="hero-chip">REQ <span>↗</span></div>
                <div className="hero-check">✓</div>
              </div>
            </section>

            <section className="workspace-grid">
              <form className="source-card card" onSubmit={createPreview}>
                <div className="section-heading">
                  <div><span className="step-number">01</span><div><h2>Bring your requirements</h2><p>Use any source alone or combine several.</p></div></div>
                  <span className="optional-tag">At least one source</span>
                </div>

                <label htmlFor="jira-keys">Jira issues or Epics <span>Optional</span></label>
                <input
                  id="jira-keys"
                  placeholder="QA-104, QA-108"
                  value={input.issueKeys}
                  onChange={(event) => updateInput("issueKeys", event.target.value)}
                />
                <p className="field-note">Issue details, accessible linked issues, and Epic children are retrieved with server-side Jira credentials.</p>

                <label htmlFor="document-urls">PRD or document links <span>Optional</span></label>
                <textarea
                  id="document-urls"
                  className="short-textarea"
                  placeholder={"Paste one HTTPS URL per line\nConfluence, Google Docs, Notion, SharePoint, or an allowed public host"}
                  value={input.urls}
                  onChange={(event) => updateInput("urls", event.target.value)}
                  rows="3"
                />

                <div className="planning-options">
                  <label htmlFor="case-target">Desired case count <span>Optional</span>
                    <input id="case-target" type="number" min="1" max="100" placeholder="Coverage-driven" value={input.testCaseTarget} onChange={(event) => updateInput("testCaseTarget", event.target.value)} />
                    <small>Target only; required coverage takes priority. Max 100.</small>
                  </label>
                  <label htmlFor="source-precedence">Source precedence
                    <select id="source-precedence" value={input.sourcePrecedence} onChange={(event) => updateInput("sourcePrecedence", event.target.value)}>
                      <option value="none">No precedence — report conflicts</option>
                      <option value="manual">Manual notes take precedence</option>
                      <option value="jira">Jira takes precedence</option>
                      <option value="documents">Documents take precedence</option>
                    </select>
                    <small>Conflicts are still shown for human clarification.</small>
                  </label>
                </div>

                <label htmlFor="manual-text">Describe the feature <span>Optional</span></label>
                <textarea
                  id="manual-text"
                  placeholder="Describe the change, user journey, business rules, acceptance criteria, and any constraints…"
                  value={input.manualText}
                  onChange={(event) => updateInput("manualText", event.target.value)}
                  rows="6"
                />

                <div className="upload-row">
                  <div className="upload-block">
                    <label htmlFor="document-files">Upload requirement files <span>Optional</span></label>
                    <input
                      id="document-files"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx"
                      onChange={(event) => updateInput("documents", Array.from(event.target.files || []))}
                    />
                    <p className="field-note">PDF, DOC, DOCX, TXT, Markdown, CSV, XLSX. Up to 5 files.</p>
                    {input.documents.length > 0 && <p className="file-list">{input.documents.map((file) => file.name).join(" · ")}</p>}
                  </div>
                  <div className="upload-block template-upload">
                    <label htmlFor="template-file">Test case template <span>Default</span></label>
                    <input id="template-file" type="file" accept=".md,text/markdown" onChange={(event) => updateInput("templateFile", event.target.files?.[0] || null)} />
                    <p className="field-note">{input.templateFile?.name || "Template1_Basic_TC_Gen.md"}</p>
                  </div>
                </div>

                <div className="source-footer">
                  <div className="template-pill"><span className="green-dot" /> 6-column template selected</div>
                  <button className="primary-button" type="submit" disabled={Boolean(busy)}>
                    {busy === "preview" ? <><span className="spinner" /> Reading sources</> : <>Preview sources <span>→</span></>}
                  </button>
                </div>
              </form>

              <aside className="side-column">
                <section className="card template-card">
                  <div className="section-heading compact"><div><span className="template-icon">▤</span><div><h2>Output template</h2><p>Authoritative structure</p></div></div></div>
                  <div className="template-name"><span className="file-icon">MD</span><div><strong>{input.templateFile?.name || template?.name || "Template1_Basic_TC_Gen.md"}</strong><small>Markdown table · six fields</small></div></div>
                  <div className="field-chips">
                    {(template?.fields || ["Test ID", "Description", "Pre-conditions", "Steps", "Expected Result", "Priority"]).map((field) => <span key={field}>{field}</span>)}
                  </div>
                  <details className="template-details">
                    <summary>Preview default template</summary>
                    <pre>{template?.template || "Loading template…"}</pre>
                  </details>
                </section>

                <section className="card guardrail-card">
                  <div className="guardrail-icon">✦</div>
                  <h3>Evidence over assumptions</h3>
                  <p>Missing behavior is flagged for clarification. AI-generated cases stay in draft until a QA owner reviews them.</p>
                  <div className="guardrail-line"><span>Source traceability</span><strong>On</strong></div>
                  <div className="guardrail-line"><span>Auto-publishing</span><strong>Off</strong></div>
                </section>
              </aside>
            </section>

            {preview && <PreviewPanel preview={preview} busy={busy} onGenerate={generate} />}
            {result && (
              <Results
                result={result}
                cases={editedCases}
                filteredCases={filteredCases}
                hasUnsavedEdits={hasUnsavedEdits}
                search={search}
                priorityFilter={priorityFilter}
                typeFilter={typeFilter}
                tab={tab}
                busy={busy}
                projectKey={jiraProjectKey}
                issueType={jiraIssueType}
                onSearch={setSearch}
                onPriority={setPriorityFilter}
                onType={setTypeFilter}
                onTab={setTab}
                onUpdate={updateCase}
                onSave={saveEdits}
                onRegenerate={regenerate}
                onApprove={approve}
                onExport={exportResult}
                onProject={setJiraProjectKey}
                onIssueType={setJiraIssueType}
              />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>QA CASE STUDIO <i>·</i> AI OUTPUT IS A DRAFT</span>
        <span>Review requirements and expected results before execution.</span>
      </footer>
    </div>
  );
}

function PreviewPanel({ preview, busy, onGenerate }) {
  return (
    <section className="preview-panel card">
      <div className="section-heading">
        <div><span className="step-number">02</span><div><h2>Review your source context</h2><p>Expand each source to inspect the exact text sent to the generator. {preview.testCaseTarget ? `Target: ${preview.testCaseTarget} cases. ` : ""}Source precedence: {preview.sourcePrecedence === "none" ? "none" : preview.sourcePrecedence}.</p></div></div>
        <span className="source-count">{preview.sources.length} source{preview.sources.length === 1 ? "" : "s"} ready</span>
      </div>
      {preview.statuses.map((status, index) => (
        <div className={`source-status ${status.status}`} key={`${status.type}-${status.title}-${index}`}>
          <span className="status-icon">{status.status === "retrieved" ? "✓" : "!"}</span>
          <div><strong>{status.title}</strong><small>{status.type} · {status.status}{status.message ? ` · ${status.message}` : ""}</small></div>
          {status.url && <a href={status.url} target="_blank" rel="noreferrer">Source ↗</a>}
        </div>
      ))}
      {preview.warnings.length > 0 && <div className="warning-box"><strong>Source notes</strong>{preview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      <div className="preview-sources">
        {preview.sources.map((source) => (
          <details className="source-preview" key={source.id}>
            <summary><span className="source-type">{source.type}</span><strong>{source.title}</strong><small>{source.characterCount.toLocaleString()} characters{source.truncated ? " · preview truncated" : ""}</small></summary>
            <pre>{source.text}{source.truncated ? "\n\n[Source was truncated at the configured extraction limit]" : ""}</pre>
            {source.alsoFrom?.length > 0 && <p className="duplicate-source-note">Duplicate content also came from: {source.alsoFrom.map((item) => item.title).join(", ")}</p>}
          </details>
        ))}
      </div>
      <div className="preview-action">
        <div><strong>Ready for analysis?</strong><span>Generation runs an analysis and a separate QA review pass.</span></div>
        <button className="primary-button" onClick={onGenerate} disabled={Boolean(busy)}>
          {busy === "generate" ? <><span className="spinner" /> Generating suite</> : <>Generate test cases <span>→</span></>}
        </button>
      </div>
    </section>
  );
}

function Results(props) {
  const { result } = props;
  return (
    <section className="results-section">
      <div className="results-title">
        <div><span className="eyebrow">GENERATION RESULT</span><h2>{result.title}</h2><p>{result.requirementSummary}</p></div>
        <span className={result.approved ? "draft-badge approved" : "draft-badge"}>{result.status}</span>
      </div>
      <div className="metric-grid">
        <Metric label="Test cases" value={result.coverage.uniqueTotal} note={`${Object.values(result.coverage.categoryCounts).length} coverage types`} />
        <Metric label="Requirements" value={result.coverage.requirementsTotal} note={`${result.coverage.requirementsCovered} mapped`} />
        <Metric label="Uncovered" value={result.coverage.uncoveredRequirements.length} note="Need review" />
        <Metric label="QA findings" value={result.qaReview.findings.length} note="Independent review" />
      </div>
      {result.requestedCaseTarget && <p className="target-note">Requested target: {result.requestedCaseTarget} test cases. The generator may deviate to preserve relevant coverage.</p>}

      <div className="results-toolbar">
        <div className="tab-list" role="tablist" aria-label="Generated result sections">
          <button className={props.tab === "cases" ? "tab active" : "tab"} onClick={() => props.onTab("cases")}>Test cases</button>
          <button className={props.tab === "template" ? "tab active" : "tab"} onClick={() => props.onTab("template")}>Template preview</button>
          <button className={props.tab === "analysis" ? "tab active" : "tab"} onClick={() => props.onTab("analysis")}>QA analysis</button>
          <button className={props.tab === "traceability" ? "tab active" : "tab"} onClick={() => props.onTab("traceability")}>Traceability</button>
        </div>
        <div className="result-actions">
          <button className="secondary-button" onClick={() => props.onExport("markdown")} disabled={Boolean(props.busy) || props.hasUnsavedEdits}>Markdown</button>
          <button className="secondary-button" onClick={() => props.onExport("csv")} disabled={Boolean(props.busy) || props.hasUnsavedEdits}>CSV</button>
          <button className="secondary-button" onClick={() => props.onExport("xlsx")} disabled={Boolean(props.busy) || props.hasUnsavedEdits}>Excel</button>
          <button className="secondary-button" onClick={() => props.onExport("report")} disabled={Boolean(props.busy) || props.hasUnsavedEdits}>QA report</button>
          <details className="jira-export">
            <summary>Jira CSV</summary>
            <div className="jira-export-fields">
              <input aria-label="Jira project key" placeholder="Project key" value={props.projectKey} onChange={(event) => props.onProject(event.target.value)} />
              <input aria-label="Jira issue type" placeholder="Issue type" value={props.issueType} onChange={(event) => props.onIssueType(event.target.value)} />
              <button className="secondary-button" onClick={() => props.onExport("jira-csv")} disabled={Boolean(props.busy) || props.hasUnsavedEdits}>Download</button>
            </div>
          </details>
        </div>
      </div>
      {props.hasUnsavedEdits && <div className="unsaved-notice">You have unsaved edits. Save them before exporting or approving this draft.</div>}

      {props.tab === "cases" && <CaseList {...props} />}
      {props.tab === "template" && <div className="report-card card"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.testCaseMarkdown}</ReactMarkdown></div>}
      {props.tab === "analysis" && <Analysis result={result} />}
      {props.tab === "traceability" && <Traceability result={result} />}

      <div className={result.approved ? "approval-bar card approved" : "approval-bar card"}>
        <div><span className="approval-mark">{result.approved ? "✓" : "!"}</span><div><strong>{result.approved ? "QA review recorded" : "Human review required"}</strong><span>{result.approved ? "This local draft is marked approved; nothing was published to Jira." : "Review generated steps, priorities, source access, and uncovered requirements before approval."}</span></div></div>
        <button className={result.approved ? "secondary-button" : "approve-button"} onClick={props.onApprove} disabled={Boolean(props.busy) || result.approved || props.hasUnsavedEdits}>
          {result.approved ? "Approved" : props.busy === "approve" ? "Saving…" : "Approve draft"}
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value, note }) {
  return <div className="metric-card card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function CaseList(props) {
  const types = [...new Set(props.cases.map((item) => item.type))].sort();
  return (
    <div className="case-workspace">
      <div className="case-tools">
        <input aria-label="Search cases" placeholder="Search test cases…" value={props.search} onChange={(event) => props.onSearch(event.target.value)} />
        <select aria-label="Filter by priority" value={props.priorityFilter} onChange={(event) => props.onPriority(event.target.value)}>
          <option value="all">All priorities</option>{["P0", "P1", "P2", "P3"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Filter by type" value={props.typeFilter} onChange={(event) => props.onType(event.target.value)}>
          <option value="all">All types</option>{types.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button className="primary-button small" onClick={props.onSave} disabled={Boolean(props.busy)}>{props.busy === "save" ? "Saving…" : "Save edits"}</button>
      </div>
      {props.filteredCases.length === 0 && <div className="empty-state card">No test cases match the current filters.</div>}
      {props.filteredCases.map((testCase) => (
        <CaseCard key={testCase.testId} testCase={testCase} busy={props.busy} onUpdate={props.onUpdate} onRegenerate={props.onRegenerate} />
      ))}
    </div>
  );
}

function CaseCard({ testCase, busy, onUpdate, onRegenerate }) {
  const [instruction, setInstruction] = useState("");
  return (
    <article className="case-card card">
      <div className="case-card-header">
        <div><span className="case-id">{testCase.testId}</span><span className={`priority priority-${testCase.priority.toLowerCase()}`}>{testCase.priority}</span><span className="case-type">{testCase.type}</span>{(testCase.categories || []).map((category) => <span className="category-tag" key={category}>{category}</span>)}</div>
        <div className="case-links">{testCase.requirementIds.length ? testCase.requirementIds.map((id) => <span key={id}>{id}</span>) : <span className="unmapped">Needs traceability review</span>}</div>
      </div>
      <div className="case-fields">
        <Field label="Description" value={testCase.description} onChange={(value) => onUpdate(testCase.testId, "description", value)} />
        <Field label="Pre-conditions" value={testCase.preconditions} onChange={(value) => onUpdate(testCase.testId, "preconditions", value)} />
        <Field label="Steps" value={testCase.steps} onChange={(value) => onUpdate(testCase.testId, "steps", value)} />
        <Field label="Expected Result" value={testCase.expectedResult} onChange={(value) => onUpdate(testCase.testId, "expectedResult", value)} />
        <label className="field-editor priority-editor"><span>Priority</span><select value={testCase.priority} onChange={(event) => onUpdate(testCase.testId, "priority", event.target.value)}>{["P0", "P1", "P2", "P3"].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <details className="case-meta"><summary>Risk and mapping details</summary><p><strong>Priority rationale:</strong> {testCase.riskRationale}</p><p><strong>Requirement IDs:</strong> {testCase.requirementIds.join(", ") || "Not specified"}</p></details>
      <div className="regenerate-row">
        <input aria-label={`Regeneration guidance for ${testCase.testId}`} placeholder="Optional guidance for regeneration…" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        <button className="text-button" onClick={() => onRegenerate(testCase.testId, instruction)} disabled={Boolean(busy)}>
          {busy === `regenerate-${testCase.testId}` ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
    </article>
  );
}

function Field({ label, value, onChange }) {
  return <label className="field-editor"><span>{label}</span><textarea rows={label === "Steps" ? 3 : 2} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Analysis({ result }) {
  return (
    <div className="analysis-grid">
      <ReportSection title="Source inventory">
        {result.sourceStatuses.map((source, index) => <div className="analysis-row" key={`${source.title}-${index}`}><strong>{source.title}</strong><span>{source.status}{source.message ? ` — ${source.message}` : ""}</span></div>)}
      </ReportSection>
      <ReportSection title="Requirements summary"><p>{result.requirementSummary}</p><ul>{result.functionalAreas.map((item, index) => <li key={index}>{item}</li>)}</ul></ReportSection>
      <ReportSection title="Ambiguities and missing details"><ObjectList items={result.ambiguities} /></ReportSection>
      <ReportSection title="Conflicts"><ObjectList items={result.conflicts} /></ReportSection>
      <ReportSection title="Assumptions and dependencies"><h4>Assumptions</h4><ObjectList items={result.assumptions} /><h4>Dependencies</h4><ObjectList items={result.dependencies} /></ReportSection>
      <ReportSection title="Risks and mitigations">{result.risks.length ? result.risks.map((risk, index) => <div className="risk-item" key={index}><span className={`priority priority-${String(risk.priority || "P2").toLowerCase()}`}>{risk.priority || "P2"}</span><strong>{risk.description}</strong><p>{risk.impact}</p><small>Mitigation: {risk.mitigation}</small></div>) : <p>Not specified</p>}</ReportSection>
      <ReportSection title="Independent QA review"><p>{result.qaReview.conclusion}</p><ObjectList items={result.qaReview.findings} /></ReportSection>
      <ReportSection title="Automation recommendations"><ObjectList items={result.automationRecommendations} /></ReportSection>
      {result.warnings.length > 0 && <ReportSection title="Warnings"><ObjectList items={result.warnings} /></ReportSection>}
    </div>
  );
}

function ObjectList({ items }) {
  if (!items?.length) return <p>Not specified</p>;
  return <ul>{items.map((item, index) => <li key={index}>{typeof item === "string" ? item : Object.entries(item).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join(" · ")}</li>)}</ul>;
}

function ReportSection({ title, children }) {
  return <section className="report-section card"><h3>{title}</h3>{children}</section>;
}

function Traceability({ result }) {
  return (
    <section className="trace-card card">
      <div className="section-heading compact"><div><span className="template-icon">◎</span><div><h2>Requirement coverage</h2><p>Uncovered requirements remain visible for follow-up.</p></div></div></div>
      <div className="trace-table-wrap"><table><thead><tr><th>Requirement</th><th>Requirement detail</th><th>Mapped test cases</th></tr></thead><tbody>
        {result.coverage.traceability.map((item) => <tr key={item.requirementId}><td><strong>{item.requirementId}</strong></td><td>{item.text}</td><td>{item.testIds.length ? item.testIds.map((id) => <span className="case-ref" key={id}>{id}</span>) : <span className="unmapped">Uncovered</span>}</td></tr>)}
      </tbody></table></div>
      <div className="trace-summary">{result.coverage.requirementsCovered} of {result.coverage.requirementsTotal} requirements mapped · {result.coverage.note}</div>
    </section>
  );
}

function Settings({ config, connection, onTest }) {
  if (!config) return <div className="settings-view card">Loading server configuration…</div>;
  return (
    <section className="settings-view">
      <div className="hero settings-hero"><div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Connections & <span>configuration.</span></h1><p>Credentials remain on the backend. This view reports status only.</p></div></div>
      <div className="settings-grid">
        <section className="settings-card card"><h2>Jira</h2><p className="settings-state">{config.jira.configured ? "Configured" : `Missing: ${config.jira.missing.join(", ")}`}</p><p>{config.jira.baseUrl || "Base URL not configured"}</p><button className="secondary-button" onClick={() => onTest("jira")} disabled={Boolean(connection)}>{connection === "jira" ? "Testing…" : "Test Jira connection"}</button></section>
        <section className="settings-card card"><h2>Language model</h2><p className="settings-state">{config.activeProvider ? `${config.activeProvider} · ${config.providers[config.activeProvider].model}` : config.providerError || "No provider configured"}</p>{["groq", "ollama"].map((name) => <div className="provider-row" key={name}><span>{name} · {config.providers[name].configured ? config.providers[name].model : `Missing ${config.providers[name].missing.join(", ")}`}</span><button className="text-button" onClick={() => onTest(name)} disabled={!config.providers[name].configured || Boolean(connection)}>{connection === name ? "Testing…" : "Test"}</button></div>)}</section>
        <section className="settings-card card"><h2>Document connectors</h2>{Object.entries(config.connectors).map(([name, enabled]) => <div className="provider-row" key={name}><span>{name === "google" ? "Google Docs" : name === "notion" ? "Notion" : "SharePoint"}</span><span className={enabled ? "status-enabled" : "status-disabled"}>{enabled ? "Configured" : "Not configured"}</span></div>)}<p className="field-note">Add only authorized tokens to the repository-root `.env`. Public URLs require an explicit host allowlist.</p></section>
        <section className="settings-card card"><h2>Upload limits</h2><p>{Math.round(config.uploadLimitBytes / 1024 / 1024)} MB per file · max 5 requirement files</p><p className="field-note">Uploads are processed in memory and are not persisted. Malware scanning requires a separate configured service.</p></section>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
