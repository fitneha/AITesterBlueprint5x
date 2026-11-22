import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templatePath = fileURLToPath(new URL("../../Template1_Basic_TC_Gen.md", import.meta.url));
export const TEMPLATE_FIELDS = [
  "Test ID",
  "Description",
  "Pre-conditions",
  "Steps",
  "Expected Result",
  "Priority"
];
const VALID_CATEGORIES = new Set([
  "functional", "non-functional", "positive", "negative", "boundary", "edge",
  "exploratory", "regression", "security", "performance"
]);
const MAX_CASES = 100;

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase().replace(/_/g, "-");
  if (value === "nonfunctional") return "non-functional";
  if (value === "edge-case") return "edge";
  if (value === "ad-hoc") return "exploratory";
  return VALID_CATEGORIES.has(value) ? value : null;
}

export async function readDefaultTemplate() {
  return readFile(templatePath, "utf8");
}

export function parseTemplate(template) {
  if (typeof template !== "string" || !template.trim()) {
    throw new Error("Provide a non-empty Markdown test case template.");
  }

  const header = template.match(/^\|\s*[^|\r\n]+(?:\s*\|\s*[^|\r\n]+)+\s*\|$/m)?.[0];
  if (!header) throw new Error("The template must contain a Markdown table header.");
  const fields = header.split("|").slice(1, -1).map((field) => field.trim());
  const expected = TEMPLATE_FIELDS.map((field) => field.toLowerCase());
  if (fields.length !== expected.length || fields.some((field, index) => field.toLowerCase() !== expected[index])) {
    throw new Error(`The template columns must be in this exact order: ${TEMPLATE_FIELDS.join(" | ")}.`);
  }
  return { template, fields };
}

function escapeCell(value) {
  return String(value ?? "Not specified")
    .replace(/\r\n?/g, "\n")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

export function renderTemplateCases(testCases, template) {
  const { fields } = parseTemplate(template);
  const header = `| ${fields.join(" | ")} |`;
  const separator = `| ${fields.map(() => "---").join(" | ")} |`;
  const rows = testCases.map((testCase) => {
    const values = fields.map((field) => escapeCell(testCase[fieldKey(field)]));
    return `| ${values.join(" | ")} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function fieldKey(field) {
  return {
    "Test ID": "testId",
    "Description": "description",
    "Pre-conditions": "preconditions",
    "Steps": "steps",
    "Expected Result": "expectedResult",
    "Priority": "priority"
  }[field];
}

export function validateTestCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("The model returned no test cases.");
  if (cases.length > MAX_CASES) throw new Error(`The test suite exceeds the ${MAX_CASES} case limit. Narrow the source scope and retry.`);
  const ids = new Set();
  return cases.map((testCase, index) => {
    const required = ["description", "steps", "expectedResult", "priority", "requirementIds"];
    if (!testCase || required.some((key) => testCase[key] === undefined || testCase[key] === null)) {
      throw new Error(`Test case ${index + 1} is missing required data.`);
    }
    if (!["P0", "P1", "P2", "P3"].includes(testCase.priority)) {
      throw new Error(`Test case ${index + 1} has an invalid priority.`);
    }
    const steps = Array.isArray(testCase.steps) ? testCase.steps : [testCase.steps];
    const normalizedSteps = Array.isArray(testCase.steps)
      ? steps.map((step, stepIndex) => {
        const value = String(step).trim();
        return /^\d+[\.\)]\s/.test(value) ? value : `${stepIndex + 1}. ${value}`;
      }).filter(Boolean).join("\n")
      : steps.map((step) => String(step).trim()).filter(Boolean).join("\n");
    const categoryValues = (Array.isArray(testCase.categories) ? testCase.categories : [testCase.type || "functional"])
      .map(normalizeCategory)
      .filter(Boolean);
    const normalized = {
      testId: String(testCase.testId || `TC-${String(index + 1).padStart(3, "0")}`),
      description: String(testCase.description).trim(),
      preconditions: String(testCase.preconditions || "Not specified").trim(),
      steps: normalizedSteps,
      expectedResult: String(testCase.expectedResult).trim(),
      priority: testCase.priority,
      type: String(testCase.type || "functional"),
      categories: [...new Set(categoryValues.length ? categoryValues : [normalizeCategory(testCase.type) || "functional"])],
      riskRationale: String(testCase.riskRationale || "Not specified"),
      requirementIds: Array.isArray(testCase.requirementIds) ? testCase.requirementIds.map(String) : []
    };
    if (!normalized.description || !normalized.steps || !normalized.expectedResult) {
      throw new Error(`Test case ${index + 1} has empty required content.`);
    }
    if (ids.has(normalized.testId)) throw new Error(`Duplicate test ID: ${normalized.testId}.`);
    ids.add(normalized.testId);
    return normalized;
  });
}
