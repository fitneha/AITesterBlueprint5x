import test from "node:test";
import assert from "node:assert/strict";
import { parseTemplate, readDefaultTemplate, renderTemplateCases, validateTestCases } from "./template.js";

test("default template preserves the supplied columns and order", async () => {
  const template = await readDefaultTemplate();
  assert.deepEqual(parseTemplate(template).fields, [
    "Test ID", "Description", "Pre-conditions", "Steps", "Expected Result", "Priority"
  ]);
});

test("template output escapes table delimiters and line breaks", () => {
  const template = "| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |\n|---|---|---|---|---|---|";
  const output = renderTemplateCases([{
    testId: "TC-001",
    description: "Check A | B",
    preconditions: "Signed in",
    steps: "Select A\nSelect B",
    expectedResult: "Saved",
    priority: "P2"
  }], template);
  assert.match(output, /^\| Test ID \| Description \| Pre-conditions \| Steps \| Expected Result \| Priority \|/);
  assert.match(output, /Check A \\| B/);
  assert.match(output, /Select A<br>Select B/);
});

test("incompatible custom templates fail instead of silently changing the output", () => {
  assert.throws(
    () => parseTemplate("| Description | Test ID | Pre-conditions | Steps | Expected Result | Priority |"),
    /exact order/
  );
});

test("test case validation rejects duplicate IDs and invalid priorities", () => {
  const base = {
    testId: "TC-1",
    description: "Open the page",
    preconditions: "Not specified",
    steps: ["Open the page"],
    expectedResult: "The page loads",
    priority: "P1",
    requirementIds: ["REQ-1"]
  };
  assert.throws(() => validateTestCases([base, base]), /Duplicate test ID/);
  assert.throws(() => validateTestCases([{ ...base, priority: "Urgent" }]), /invalid priority/);
});

test("the output limit accepts 100 cases and rejects case 101", () => {
  const cases = Array.from({ length: 100 }, (_value, index) => ({
    testId: `TC-${index + 1}`,
    description: `Case ${index + 1}`,
    preconditions: "Not specified",
    steps: ["Run the test"],
    expectedResult: "The result is observable",
    priority: "P2",
    requirementIds: ["REQ-1"]
  }));
  assert.equal(validateTestCases(cases).length, 100);
  assert.throws(() => validateTestCases([...cases, { ...cases[0], testId: "TC-101" }]), /100 case limit/);
});
