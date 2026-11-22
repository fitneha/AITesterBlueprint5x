import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { createRequire } from "node:module";
import { basename, extname } from "node:path";
import { Buffer } from "node:buffer";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const MAX_SOURCE_CHARS = 50000;

export class SourceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SourceError";
    this.status = status;
  }
}

function boundedText(text) {
  const clean = String(text || "").replace(/\u0000/g, "").trim();
  return {
    text: clean.slice(0, MAX_SOURCE_CHARS),
    truncated: clean.length > MAX_SOURCE_CHARS
  };
}

function decodeHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (entity, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function ipv4Private(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113);
}

function ipv6Private(address) {
  const value = address.toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    return isIP(mapped) === 4 ? ipv4Private(mapped) : true;
  }
  if (value === "::" || value === "::1") return true;
  const firstGroup = Number.parseInt(value.split(":").find(Boolean) || "0", 16);
  return (firstGroup & 0xfe00) === 0xfc00 ||
    (firstGroup & 0xffc0) === 0xfe80 ||
    (firstGroup & 0xff00) === 0xff00 ||
    value.startsWith("2001:db8:");
}

async function validatePublicHttpsUrl(input, allowedHosts) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new SourceError("A document URL is invalid.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new SourceError("Document links must use HTTPS and must not contain credentials.");
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new SourceError("Private and local document hosts are not allowed.");
  }
  const isAllowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (!isAllowed) {
    throw new SourceError(`The document host is not configured. Add ${hostname} to DOCUMENT_ALLOWED_HOSTS or use an authorized connector.`);
  }
  if (isIP(hostname)) {
    if (isIP(hostname) === 4 ? ipv4Private(hostname) : ipv6Private(hostname)) {
      throw new SourceError("Private and local IP addresses are not allowed for document URLs.");
    }
    throw new SourceError("Configure an allowlisted public hostname instead of an IP address.");
  }
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SourceError(`Could not resolve document host ${hostname}.`);
  }
  if (!addresses.length || addresses.some(({ address }) => (
    isIP(address) === 4 ? ipv4Private(address) : ipv6Private(address)
  ))) {
    throw new SourceError("The document host resolves to a private or non-public IP address.");
  }
  return { url, address: addresses[0] };
}

async function readResponse(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new SourceError("The remote document exceeds the configured size limit.", 413);
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SourceError("The remote document exceeds the configured size limit.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function csvText(buffer) {
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

async function extractBuffer(buffer, filename) {
  const extension = extname(filename).toLowerCase();
  if ([".docx", ".xlsx"].includes(extension) && !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new SourceError(`${basename(filename)} is not a valid Office Open XML file.`);
  }
  if (extension === ".doc" && !buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw new SourceError(`${basename(filename)} is not a valid legacy Word document.`);
  }
  if (extension === ".pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new SourceError(`${basename(filename)} is not a valid PDF document.`);
  }
  if ([".txt", ".md", ".csv"].includes(extension)) return csvText(buffer);
  if (extension === ".pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (extension === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value;
  }
  if (extension === ".doc") {
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    return document.getBody();
  }
  if (extension === ".xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook.worksheets.map((sheet) => {
      const rows = [];
      sheet.eachRow((row, rowNumber) => {
        rows.push(`${sheet.name} row ${rowNumber}: ${row.values.slice(1).map((value) => String(value ?? "")).join(" | ")}`);
      });
      return rows.join("\n");
    }).join("\n");
  }
  throw new SourceError(`Unsupported file type: ${extension || "unknown"}.`);
}

export async function extractUploadedFile(file, maxBytes) {
  if (!file?.buffer || !file.originalname) throw new SourceError("An uploaded file could not be read.");
  if (file.size > maxBytes) throw new SourceError(`${file.originalname} exceeds the upload size limit.`, 413);
  let text;
  try {
    text = await extractBuffer(file.buffer, basename(file.originalname));
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(`Could not extract text from ${basename(file.originalname)}. Check that the file is valid and readable.`);
  }
  const content = boundedText(text);
  if (!content.text) throw new SourceError(`${basename(file.originalname)} contains no readable text.`);
  return {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "upload",
    title: basename(file.originalname),
    text: content.text,
    truncated: content.truncated
  };
}

async function requestJson(url, token, fetchImpl, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...headers },
      redirect: "error",
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new SourceError("Could not reach the configured document provider.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new SourceError("The document provider denied access. Check the configured token and permissions.", 403);
  }
  if (!response.ok) throw new SourceError(`The document provider returned an unexpected response (${response.status}).`);
  const body = await readResponse(response, 2 * 1024 * 1024);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new SourceError("The document provider returned malformed JSON.");
  }
}

function notionBlockText(block) {
  const body = block[block.type] || {};
  const richText = body.rich_text || body.title || [];
  return richText.map((item) => item.plain_text || item.text?.content || "").join("");
}

async function fetchNotion(url, config, fetchImpl) {
  const id = url.pathname.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new SourceError("Could not identify a Notion page ID in the URL.");
  if (!config.notionToken) throw new SourceError("Notion access is not configured. Set NOTION_TOKEN or paste/upload the content.");
  const page = await requestJson(`https://api.notion.com/v1/pages/${id.replace(/-/g, "")}`, config.notionToken, fetchImpl, {
    "Notion-Version": "2022-06-28"
  });
  const blockItems = [];
  let cursor = "";
  let hasMore = true;
  while (hasMore && blockItems.length < 500) {
    const query = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const blocks = await requestJson(`https://api.notion.com/v1/blocks/${page.id}/children?${query}`, config.notionToken, fetchImpl, {
      "Notion-Version": "2022-06-28"
    });
    blockItems.push(...(blocks.results || []));
    hasMore = Boolean(blocks.has_more);
    cursor = blocks.next_cursor || "";
    if (!cursor) break;
  }
  const title = page.properties?.title?.title?.map((part) => part.plain_text).join("") ||
    Object.values(page.properties || {}).find((property) => property.type === "title")?.title?.map((part) => part.plain_text).join("") ||
    url.href;
  const text = blockItems.map(notionBlockText).filter(Boolean).join("\n");
  return { title, text, truncated: hasMore };
}

async function fetchGoogleDoc(url, config, fetchImpl) {
  const id = url.pathname.match(/\/document\/d\/([^/]+)/)?.[1];
  if (!id) throw new SourceError("Could not identify a Google document ID in the URL.");
  if (!config.googleAccessToken) throw new SourceError("Google Docs access is not configured. Set GOOGLE_ACCESS_TOKEN or paste/upload the content.");
  const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text%2Fplain`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${config.googleAccessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new SourceError("Could not reach Google Drive.");
  }
  if (response.status === 401 || response.status === 403) throw new SourceError("Google Drive denied access. Check token permissions.", 403);
  if (!response.ok) throw new SourceError(`Google Drive returned an unexpected response (${response.status}).`);
  const body = await readResponse(response, config.maxUploadBytes);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new SourceError("Google Drive returned content that was not valid UTF-8 text.");
  }
  return { title: `Google document ${id}`, text };
}

async function fetchConfluence(url, config, fetchImpl) {
  const pageId = url.pathname.match(/\/pages\/(\d+)/)?.[1];
  if (!pageId) throw new SourceError("Could not identify a Confluence page ID in the URL.");
  if (config.jira.missing.length) throw new SourceError(`Confluence access needs Jira credentials: ${config.jira.missing.join(", ")}.`);
  let base;
  try {
    base = new URL(config.jira.baseUrl);
  } catch {
    throw new SourceError("JIRA_BASE_URL is not a valid URL.");
  }
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new SourceError("Confluence credentials require an HTTPS JIRA_BASE_URL without embedded credentials.");
  }
  if (url.hostname !== base.hostname) {
    throw new SourceError("Confluence host must match the configured Atlassian tenant.");
  }
  const endpoint = `${config.jira.baseUrl}/wiki/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,space`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.jira.email}:${config.jira.token}`).toString("base64")}`,
        Accept: "application/json"
      },
      redirect: "error",
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new SourceError("Could not reach the configured Confluence tenant.");
  }
  if (response.status === 401 || response.status === 403) throw new SourceError("Confluence denied access. Check Jira credentials and page permissions.", 403);
  if (!response.ok) throw new SourceError(`Confluence returned an unexpected response (${response.status}).`);
  const body = await readResponse(response, 2 * 1024 * 1024);
  let page;
  try {
    page = JSON.parse(body.toString("utf8"));
  } catch {
    throw new SourceError("Confluence returned malformed JSON.");
  }
  return { title: page.title || "Confluence page", text: decodeHtml(page.body?.storage?.value || "") };
}

async function fetchSharePoint(url, config, fetchImpl, maxBytes) {
  if (!config.graphAccessToken) throw new SourceError("SharePoint access is not configured. Set MS_GRAPH_ACCESS_TOKEN or paste/upload the content.");
  const shareId = `u!${Buffer.from(url.href).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  let response;
  try {
    response = await fetchImpl(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/content`, {
      headers: { Authorization: `Bearer ${config.graphAccessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new SourceError("Could not reach Microsoft Graph.");
  }
  if (response.status === 401 || response.status === 403) throw new SourceError("Microsoft Graph denied access. Check token permissions.", 403);
  if (![200, 302, 301].includes(response.status)) throw new SourceError(`Microsoft Graph returned an unexpected response (${response.status}).`);

  let fileResponse = response;
  if (response.status !== 200) {
    const location = response.headers.get("location");
    if (!location) throw new SourceError("Microsoft Graph did not provide a file download URL.");
    const downloadUrl = new URL(location);
    const trustedHost = downloadUrl.hostname.endsWith(".sharepoint.com") || downloadUrl.hostname.endsWith(".1drv.com");
    if (downloadUrl.protocol !== "https:" || !trustedHost) throw new SourceError("Microsoft Graph returned an untrusted file URL.");
    fileResponse = await fetchImpl(downloadUrl, { redirect: "error", signal: AbortSignal.timeout(20000) });
  }
  if (!fileResponse.ok) throw new SourceError(`The SharePoint file could not be downloaded (${fileResponse.status}).`);
  const buffer = await readResponse(fileResponse, maxBytes);
  const contentDisposition = response.headers.get("content-disposition") || fileResponse.headers.get("content-disposition") || "";
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  let downloadName = encodedName || quotedName || basename(url.pathname) || "sharepoint-document";
  try {
    downloadName = decodeURIComponent(downloadName);
  } catch {
    throw new SourceError("SharePoint returned an invalid file name.");
  }
  const filename = basename(downloadName.replace(/[\\/]/g, "_"));
  return { title: filename, text: await extractBuffer(buffer, filename) };
}

async function fetchAllowedPublicLink(url, config, maxBytes) {
  const { address } = await validatePublicHttpsUrl(url.href, config.documentAllowedHosts);
  const { status, headers, buffer } = await fetchPinnedUrl(url, address, maxBytes);
  if (status < 200 || status >= 300) throw new SourceError(`The public document returned an unexpected response (${status}).`);
  if (headers["content-encoding"] && headers["content-encoding"] !== "identity") {
    throw new SourceError("The configured public link returned compressed content that could not be safely parsed.");
  }
  const contentType = String(headers["content-type"] || "").toLowerCase();
  if (contentType.includes("text/html")) return { title: url.hostname, text: decodeHtml(buffer.toString("utf8")) };
  if (contentType.includes("text/plain")) return { title: url.hostname, text: buffer.toString("utf8") };
  if (contentType.includes("application/pdf")) return { title: url.hostname, text: await extractBuffer(buffer, "document.pdf") };
  throw new SourceError("The configured public link is not HTML, plain text, or PDF.");
}

function fetchPinnedUrl(url, address, maxBytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request(url, {
      method: "GET",
      servername: url.hostname,
      headers: {
        Accept: "text/html,text/plain,application/pdf",
        "Accept-Encoding": "identity"
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      }
    }, (response) => {
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > maxBytes) {
        response.destroy();
        fail(new SourceError("The remote document exceeds the configured size limit.", 413));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy();
          fail(new SourceError("The remote document exceeds the configured size limit.", 413));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          status: response.statusCode || 502,
          headers: response.headers,
          buffer: Buffer.concat(chunks, total)
        });
      });
      response.on("error", (error) => fail(new SourceError(error.message === "aborted"
        ? "The public document connection was interrupted."
        : "Could not read the public document response.")));
    });
    request.setTimeout(20000, () => request.destroy(new Error("timeout")));
    request.on("error", () => fail(new SourceError("Could not retrieve the configured public document URL.")));
    request.end();
  });
}

export async function fetchDocumentSource(input, config, fetchImpl = fetch) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new SourceError("A document URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new SourceError("Document links must use HTTPS and must not contain credentials.");
  }

  let document;
  if (url.hostname === "docs.google.com") {
    document = await fetchGoogleDoc(url, config, fetchImpl);
  } else if (url.hostname === "notion.so" || url.hostname === "www.notion.so" || url.hostname === "notion.site") {
    document = await fetchNotion(url, config, fetchImpl);
  } else if (url.hostname.endsWith(".sharepoint.com") || url.hostname === "1drv.ms") {
    document = await fetchSharePoint(url, config, fetchImpl, config.maxUploadBytes);
  } else if (url.hostname === new URL(config.jira.baseUrl || "https://invalid.example").hostname && url.pathname.includes("/wiki/")) {
    document = await fetchConfluence(url, config, fetchImpl);
  } else {
    document = await fetchAllowedPublicLink(url, config, config.maxUploadBytes);
  }

  const content = boundedText(document.text);
  if (!content.text) throw new SourceError(`No readable content was retrieved from ${url.hostname}.`);
  return {
    id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "url",
    title: document.title || url.hostname,
    url: url.href,
    text: content.text,
    truncated: content.truncated || Boolean(document.truncated) || document.text.length > MAX_SOURCE_CHARS
  };
}
