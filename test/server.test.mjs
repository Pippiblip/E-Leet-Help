import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

let child;
let baseUrl;

async function unusedPort() {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), LLM_API_KEY: "" },
    stdio: "ignore",
  });
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Local server did not start in time.");
});

after(() => {
  child?.kill();
});

test("serves the local app and reports provider configuration", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.match(html, /Hiregram/);
  assert.match(html, /panel-tabs/);

  const panelStyles = await fetch(`${baseUrl}/panel.css`);
  assert.equal(panelStyles.status, 200);
  assert.match(await panelStyles.text(), /--accent:\s*#ffa116/i);

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.providerConfigured, false);
});

test("requires a configured key before an analysis request", async () => {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problemSlug: "two-sum",
      title: "Two Sum",
      language: "Python",
      code: "print('not sent')",
    }),
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "MISSING_API_KEY");
  assert.match(body.error.message, /Add your API key/);
});

test("rejects malformed analysis input with an actionable error", async () => {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problemSlug: "two sum", title: "", language: "Python", code: "" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.message, "Enter a valid problem slug.");
});

test("validates and normalizes a provider response without returning the API key", async () => {
  const modelOutput = {
    primaryPattern: "hash map",
    scores: {
      quality: { value: 9, reason: "A hash map avoids the repeated scan.", evidence: ["One map lookup."] },
      readability: { value: 7, reason: "The loop is easy to follow.", evidence: ["A named complement is checked."] },
      concept: { value: 8, reason: "A map fits complement lookup.", evidence: ["Prior values are retained."] },
    },
    complexity: {
      current: { approach: "Nested scan", time: "O(n^2)", space: "O(1)" },
      suggested: { approach: "Hash map", time: "O(n)", space: "O(n)" },
    },
    concepts: [{ name: "Complement lookup", why: "Avoids rescanning earlier values.", patternTag: "hash map" }],
    recommendations: [{ text: "Keep the lookup map scoped to this solve." }],
    hints: { repeatedWork: "", bottleneck: "", structure: "" },
  };
  const provider = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.match(payload.messages[1].content, /def twoSum/);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const providerPort = provider.address().port;
  const appPort = await unusedPort();
  const appServer = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      LLM_API_KEY: "test-secret",
      LLM_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
      LLM_MODEL: "test-model",
    },
    stdio: "ignore",
  });
  try {
    const appUrl = `http://127.0.0.1:${appPort}`;
    const started = Date.now();
    while (Date.now() - started < 5000) {
      try {
        const health = await fetch(`${appUrl}/api/health`);
        if (health.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const response = await fetch(`${appUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemSlug: "two-sum",
        title: "Two Sum",
        language: "Python",
        code: "def twoSum(nums, target):\n    pass",
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result.scores.quality.value, 8);
    assert.equal(body.result.complexity.current.confidence, "llm_only");
    assert.equal(body.result.complexity.suggested.confidence, "llm_claimed");
    assert.deepEqual(body.result.hints, { repeatedWork: "", bottleneck: "", structure: "" });
    assert.equal(body.model, "test-model");
    assert.equal(JSON.stringify(body).includes("test-secret"), false);
  } finally {
    appServer.kill();
    await new Promise((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
  }
});
