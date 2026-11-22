import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { extractUploadedFile, fetchDocumentSource } from "./documents.js";

test("plain text uploads are read in memory and preserve their source name", async () => {
  const file = {
    originalname: "requirements.txt",
    size: 19,
    buffer: Buffer.from("The page must load.", "utf8")
  };
  const result = await extractUploadedFile(file, 1024);
  assert.equal(result.title, "requirements.txt");
  assert.equal(result.text, "The page must load.");
  assert.equal(result.type, "upload");
});

test("unsupported uploads and invalid document signatures are rejected", async () => {
  await assert.rejects(
    () => extractUploadedFile({ originalname: "data.bin", size: 1, buffer: Buffer.from("x") }, 1024),
    /Unsupported file type/
  );
  await assert.rejects(
    () => extractUploadedFile({ originalname: "broken.pdf", size: 4, buffer: Buffer.from("nope") }, 1024),
    /not a valid PDF/
  );
});

test("XLSX uploads extract worksheet content", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Requirements");
  worksheet.addRow(["Rule", "Details"]);
  worksheet.addRow(["REQ-1", "Valid users reach the dashboard"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await extractUploadedFile({
    originalname: "requirements.xlsx",
    size: buffer.length,
    buffer
  }, 1024 * 1024);
  assert.match(result.text, /REQ-1/);
  assert.match(result.text, /Valid users reach the dashboard/);
});

test("public URLs require an explicit host allowlist before any request", async () => {
  let called = false;
  await assert.rejects(
    () => fetchDocumentSource("https://public.example/doc", {
      jira: { baseUrl: "", missing: [] },
      documentAllowedHosts: [],
      maxUploadBytes: 1024
    }, async () => { called = true; }),
    /host is not configured/
  );
  assert.equal(called, false);
});

test("public URL validation blocks private IPs even if an IP was allowlisted", async () => {
  await assert.rejects(
    () => fetchDocumentSource("https://127.0.0.1/document", {
      jira: { baseUrl: "", missing: [] },
      documentAllowedHosts: ["127.0.0.1"],
      maxUploadBytes: 1024
    }),
    /Private and local IP/
  );
});
