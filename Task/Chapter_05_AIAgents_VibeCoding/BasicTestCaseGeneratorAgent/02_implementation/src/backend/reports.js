function cell(value) {
  return String(value ?? "Not specified").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function list(items, empty = "Not specified") {
  if (!Array.isArray(items) || !items.length) return `- ${empty}`;
  return items.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n");
}

export function buildQaReport(result) {
  const sourceRows = (result.sourceStatuses || []).map((source) =>
    `| ${cell(source.type)} | ${cell(source.title)} | ${cell(source.status)} | ${cell(source.message || source.url || "Not specified")} |`
  );
  const requirementRows = (result.requirements || []).map((requirement) =>
    `| ${cell(requirement.id)} | ${cell(requirement.text)} | ${cell(requirement.sourceIds.join(", ") || "Not specified")} |`
  );
  const traceRows = (result.coverage?.traceability || []).map((item) =>
    `| ${cell(item.requirementId)} | ${cell(item.text)} | ${cell(item.testIds.join(", ") || "No mapped test cases")} |`
  );
  const riskRows = (result.risks || []).map((risk) =>
    `| ${cell(risk.priority)} | ${cell(risk.description)} | ${cell(risk.impact)} | ${cell(risk.mitigation)} |`
  );
  const reviewRows = (result.qaReview?.findings || []).map((finding) =>
    `| ${cell(finding.severity)} | ${cell(finding.issue)} | ${cell(finding.affectedTestIds.join(", "))} | ${cell(finding.recommendation)} |`
  );

  return [
    `# QA Analysis — ${result.title || "Test Case Draft"}`,
    "",
    "> Status: **DRAFT — pending human review.** AI-generated cases are not QA-approved.",
    "",
    "## Requirement Summary",
    result.requirementSummary || "Not specified",
    result.requestedCaseTarget ? `\nRequested test case target: ${result.requestedCaseTarget}. Coverage may justify a different number.` : "",
    `\nSource precedence: ${result.sourcePrecedence || "none"}.`,
    "",
    "## Source Inventory",
    "| Type | Source | Status | Access details |",
    "|---|---|---|---|",
    ...(sourceRows.length ? sourceRows : ["| Not specified | Not specified | Not specified | Not specified |"]),
    "",
    "## Functional Areas",
    list(result.functionalAreas),
    "",
    "## Requirements and Traceability",
    "| Requirement | Description | Source IDs |",
    "|---|---|---|",
    ...(requirementRows.length ? requirementRows : ["| Not specified | Not specified | Not specified |"]),
    "",
    "| Requirement | Text | Mapped test IDs |",
    "|---|---|---|",
    ...(traceRows.length ? traceRows : ["| Not specified | Not specified | Not specified |"]),
    "",
    "## Coverage Summary",
    `- Unique test cases: ${result.coverage?.uniqueTotal ?? 0}`,
    `- Requirements covered: ${result.coverage?.requirementsCovered ?? 0} / ${result.coverage?.requirementsTotal ?? 0}`,
    `- Uncovered requirements: ${(result.coverage?.uncoveredRequirements || []).join(", ") || "None identified"}`,
    `- Category counts: ${JSON.stringify(result.coverage?.categoryCounts || {})}`,
    `- Priority counts: ${JSON.stringify(result.coverage?.priorityCounts || {})}`,
    `- Note: ${result.coverage?.note || "Category counts may overlap."}`,
    "",
    "## Ambiguities and Missing Information",
    list(result.ambiguities),
    "",
    "## Conflicting Requirements",
    list(result.conflicts),
    "",
    "## Assumptions and Dependencies",
    "### Assumptions",
    list(result.assumptions),
    "### Dependencies",
    list(result.dependencies),
    "",
    "## Risks and Mitigations",
    "| Priority | Risk | Impact | Mitigation |",
    "|---|---|---|---|",
    ...(riskRows.length ? riskRows : ["| Not specified | Not specified | Not specified | Not specified |"]),
    "",
    "## Independent QA Review",
    result.qaReview?.conclusion || "Not specified",
    "",
    "| Severity | Finding | Affected tests | Recommendation |",
    "|---|---|---|---|",
    ...(reviewRows.length ? reviewRows : ["| Not specified | No additional findings returned | Not specified | Review against source requirements |"]),
    "",
    "## Automation Recommendations",
    list(result.automationRecommendations),
    "",
    "## Source Retrieval and Generation Warnings",
    list(result.warnings),
    "",
    "## Human Review Gate",
    "- Confirm source permissions and completeness.",
    "- Resolve material ambiguities and conflicts.",
    "- Review coverage, priorities, and generated expected results.",
    "- Approve before using the test cases as an execution baseline.",
    ""
  ].join("\n");
}
