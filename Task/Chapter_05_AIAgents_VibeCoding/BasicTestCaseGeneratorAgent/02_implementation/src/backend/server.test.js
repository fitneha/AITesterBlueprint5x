import test from "node:test";
import assert from "node:assert/strict";
import app from "./server.js";

async function withServer(run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("manual-only source preview works without a Jira issue key", async () => {
  await withServer(async (baseUrl) => {
    const form = new FormData();
    form.append("manualText", "When a valid user logs in, show the dashboard.");
    const response = await fetch(`${baseUrl}/api/preview`, { method: "POST", body: form });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.previewId);
    assert.equal(payload.sources.length, 1);
    assert.match(payload.sources[0].text, /valid user logs in/);
    assert.equal(payload.statuses[0].status, "retrieved");
  });
});

test("empty preview requests return a client error", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/preview`, { method: "POST", body: new FormData() });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /Add a Jira issue/);
  });
});

test("preview validates the optional test case target", async () => {
  await withServer(async (baseUrl) => {
    const form = new FormData();
    form.append("manualText", "A test requirement.");
    form.append("testCaseTarget", "101");
    const response = await fetch(`${baseUrl}/api/preview`, { method: "POST", body: form });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /between 1 and 100/);
  });
});

test("public runtime config does not include credentials", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/config`);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);
    assert.equal(response.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.jira, "token"), false);
    assert.equal(serialized.includes("GROQ_API_KEY="), false);
    assert.equal(serialized.includes("JIRA_TOKEN="), false);
  });
});
