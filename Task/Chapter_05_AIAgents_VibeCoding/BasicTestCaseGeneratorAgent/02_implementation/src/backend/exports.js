import ExcelJS from "exceljs";
import { renderTemplateCases, validateTestCases } from "./template.js";

const CSV_COLUMNS = ["Test ID", "Description", "Pre-conditions", "Steps", "Expected Result", "Priority"];

function asRow(testCase) {
  return [
    testCase.testId,
    testCase.description,
    testCase.preconditions,
    testCase.steps,
    testCase.expectedResult,
    testCase.priority
  ];
}

function csvEscape(value) {
  const raw = String(value ?? "");
  const text = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(testCases) {
  const rows = [CSV_COLUMNS, ...testCases.map(asRow)];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export function buildJiraCsv(testCases, { projectKey, issueType }) {
  if (!/^[A-Z][A-Z0-9_]{0,9}$/.test(String(projectKey || "").trim().toUpperCase())) {
    throw new Error("Provide a valid Jira project key for Jira CSV export.");
  }
  if (!String(issueType || "").trim()) throw new Error("Provide a Jira issue type enabled in the target project.");
  const columns = ["Project key", "Issue Type", "Summary", "Description", "Priority", "Labels"];
  const rows = [columns, ...testCases.map((testCase) => [
    projectKey.trim().toUpperCase(),
    issueType.trim(),
    `${testCase.testId}: ${testCase.description}`,
    [
      `Pre-conditions: ${testCase.preconditions}`,
      `Steps: ${testCase.steps}`,
      `Expected Result: ${testCase.expectedResult}`
    ].join("\n"),
    testCase.priority,
    "ai-generated-test-case"
  ])];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export async function buildXlsx(testCases) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Test Cases");
  sheet.addRow(CSV_COLUMNS);
  for (const testCase of testCases) sheet.addRow(asRow(testCase));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = [
    { width: 14 }, { width: 40 }, { width: 35 }, { width: 55 }, { width: 45 }, { width: 12 }
  ];
  return workbook.xlsx.writeBuffer();
}

export function normalizedCases(input) {
  return validateTestCases(input);
}

export function markdownCases(testCases, template) {
  return renderTemplateCases(testCases, template);
}
