import test from "node:test";
import assert from "node:assert/strict";
import { buildCsv, buildJiraCsv, buildXlsx } from "./exports.js";

const cases = [{
  testId: "TC-001",
  description: 'Quote "value", check',
  preconditions: "User exists",
  steps: "Open page; Submit",
  expectedResult: "Success",
  priority: "P1",
  requirementIds: ["REQ-1"]
}];

test("CSV export preserves the six template fields and escapes delimiters", () => {
  const csv = buildCsv(cases);
  assert.match(csv, /^Test ID,Description,Pre-conditions,Steps,Expected Result,Priority/);
  assert.match(csv, /"Quote ""value"", check"/);
});

test("Jira import CSV requires an explicit project key and issue type", () => {
  assert.throws(() => buildJiraCsv(cases, {}), /project key/);
  const csv = buildJiraCsv(cases, { projectKey: "qa", issueType: "Test" });
  assert.match(csv, /^Project key,Issue Type,Summary,Description,Priority,Labels/);
  assert.match(csv, /QA,Test,"TC-001:/);
});

test("CSV export neutralizes formula-like cell content", () => {
  const csv = buildCsv([{ ...cases[0], description: "=HYPERLINK(\"https://example.test\")" }]);
  assert.match(csv, /"'=HYPERLINK/);
});

test("Excel export returns a valid workbook container", async () => {
  const workbook = Buffer.from(await buildXlsx(cases));
  assert.equal(workbook.subarray(0, 2).toString("ascii"), "PK");
});
