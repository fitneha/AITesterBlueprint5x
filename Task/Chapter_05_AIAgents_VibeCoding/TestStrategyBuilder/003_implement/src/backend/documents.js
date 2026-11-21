import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templatePath = fileURLToPath(new URL("../../test_strategy_template.md", import.meta.url));

export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = "TemplateError";
    this.status = 500;
  }
}

export async function readStrategyTemplate() {
  try {
    return await readFile(templatePath, "utf8");
  } catch {
    throw new TemplateError("The supplied test strategy template could not be read.");
  }
}

export function getTemplateHeadings(template) {
  return template.match(/^#{1,6}\s+.+$/gm) || [];
}

export function getRegenerableHeadings(template) {
  return getTemplateHeadings(template).slice(1).filter((heading) => heading !== "## HUMAN REVIEW GATE");
}

export function hasTemplateHeadings(document, template) {
  const expected = getTemplateHeadings(template);
  const actual = getTemplateHeadings(document);
  if (actual.length !== expected.length) return false;

  return expected.every((heading, index) => {
    const placeholderStart = heading.indexOf("<");
    if (placeholderStart < 0) return actual[index] === heading;
    return actual[index].startsWith(heading.slice(0, placeholderStart));
  });
}

function documentSourceLine(issues) {
  const sources = [...new Map(issues.map((issue) => [issue.key, issue])).values()];
  const visible = sources.slice(0, 50).map((issue) => `[${issue.key}](${issue.sourceUrl})`);
  const remaining = sources.length - visible.length;
  if (remaining > 0) visible.push(`${remaining} additional source issue(s), listed in the requirement analysis`);
  return visible.length ? visible.join(", ") : "Not provided – requires confirmation.";
}

export function prepareStrategyMarkdown(markdown, template, issues, generatedAt = new Date().toISOString()) {
  if (!hasTemplateHeadings(markdown, template)) {
    throw new TemplateError("The generated strategy did not preserve the supplied template headings and order.");
  }
  const humanReviewHeading = "## HUMAN REVIEW GATE";
  if (getTemplateHeadings(template).includes(humanReviewHeading)) {
    markdown = replaceSection(markdown, humanReviewHeading, extractSection(template, humanReviewHeading));
  }

  const primaryIssue = issues.find((issue) => ["selected", "selected epic"].includes(issue.sourceRole)) || issues[0];
  const title = (primaryIssue?.title || "Not provided – requires confirmation.").replace(/\s+/g, " ").trim();
  const documentTitle = primaryIssue?.key
    ? `# Test Strategy — ${primaryIssue.key}: ${title}`
    : "# Test Strategy — Not provided – requires confirmation.";
  const lines = markdown.trim().split(/\r?\n/);
  lines[0] = documentTitle;

  const statusLine = template.match(/^> Status:.*$/m)?.[0];
  const statusIndex = lines.findIndex((line) => /^> Status:/.test(line));
  if (statusIndex >= 0) {
    lines[statusIndex] = statusLine;
  } else if (statusLine) {
    lines.splice(1, 0, statusLine);
  }

  const finalStatusIndex = lines.findIndex((line) => /^> Status:/.test(line));
  const metadata = [
    `> **Document version:** 1.0`,
    `> **Generated:** ${generatedAt}`,
    `> **Source Jira issues:** ${documentSourceLine(issues)}`
  ];
  lines.splice(finalStatusIndex + 1, 0, ...metadata);
  return lines.join("\n");
}

function renderFindings(title, items) {
  const lines = [`## ${title}`];
  if (!items.length) return `${lines.join("\n")}\n\n- Not provided – requires confirmation.`;
  for (const [index, item] of items.entries()) {
    const refs = item.sourceRefs.length ? ` *(Sources: ${item.sourceRefs.join(", ")})*` : "";
    lines.push(`${index + 1}. ${item.text}${refs}`);
  }
  return lines.join("\n\n");
}

const ANALYSIS_SECTIONS = [
  ["Business objectives", "businessObjectives"],
  ["Confirmed requirements", "confirmedRequirements"],
  ["Inferred requirements", "inferredRequirements"],
  ["Modules and critical workflows", "modulesAndWorkflows"],
  ["Roles and permissions", "rolesAndPermissions"],
  ["Integrations and APIs", "integrationsAndApis"],
  ["Data validation", "dataValidation"],
  ["Security implications", "securityImplications"],
  ["Failure scenarios", "failureScenarios"],
  ["Risks and dependencies", "risksAndDependencies"],
  ["Missing information", "missingInformation"],
  ["Assumptions requiring validation", "assumptions"]
];

export function buildRequirementAnalysisMarkdown(analysis, sourceCount) {
  const sections = [
    "# Requirement Analysis",
    `Analyzed Jira issue count: **${sourceCount}**. Findings are based on retrieved Jira content; inferred items are not confirmed requirements.`
  ];
  for (const [heading, key] of ANALYSIS_SECTIONS) {
    sections.push(renderFindings(heading, analysis[key]));
  }
  return sections.join("\n\n");
}

export function buildValidationReport(analysis, summary, issues, generatedAt) {
  const confirmedCount = analysis.confirmedRequirements.length;
  const inferredCount = analysis.inferredRequirements.length;
  const missingCount = analysis.missingInformation.length;
  const riskCount = analysis.risksAndDependencies.length;
  const assumptionCount = analysis.assumptions.length;
  const sourceKeys = [...new Set(issues.map((issue) => issue.key))];
  const sourceLinks = sourceKeys.slice(0, 50).map((key) => {
    const issue = issues.find((item) => item.key === key);
    return `[${key}](${issue?.sourceUrl || "#"})`;
  });
  if (sourceKeys.length > sourceLinks.length) sourceLinks.push(`${sourceKeys.length - sourceLinks.length} additional source issue(s)`);

  return [
    "# Strategy Validation Report",
    `- **Generated:** ${generatedAt}`,
    `- **Document version:** 1.0`,
    `- **Source Jira issues analyzed:** ${sourceKeys.length}`,
    `- **Confirmed requirements:** ${confirmedCount}`,
    `- **Inferred requirements:** ${inferredCount}`,
    `- **Missing-information findings:** ${missingCount}`,
    `- **Identified risks/dependencies:** ${riskCount}`,
    `- **Unresolved assumptions:** ${assumptionCount}`,
    `- **Template structure:** Passed (all supplied headings are present in order)`,
    "",
    "## Completeness Assessment",
    summary || "Not provided – requires confirmation.",
    "",
    "## Source References",
    sourceLinks.length ? sourceLinks.join(", ") : "Not provided – requires confirmation.",
    "",
    "## Review Gate",
    "This report does not constitute sign-off. Review the strategy, issue references, risks, assumptions, and open questions with QA, Engineering, and Product owners."
  ].join("\n");
}

export function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => line === heading);
  if (index < 0) return "";
  const nextIndex = lines.findIndex((line, candidate) => candidate > index && /^#{1,6}\s+/.test(line));
  return lines.slice(index, nextIndex < 0 ? lines.length : nextIndex).join("\n").trim();
}

export function replaceSection(markdown, heading, replacement) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line === heading);
  if (start < 0) throw new TemplateError("The selected strategy section was not found.");
  let end = lines.findIndex((line, index) => index > start && /^#{1,6}\s+/.test(line));
  if (end < 0) end = lines.length;
  const updated = [...lines.slice(0, start), ...replacement.trim().split(/\r?\n/), ...lines.slice(end)];
  return updated.join("\n");
}

export { ANALYSIS_SECTIONS };
