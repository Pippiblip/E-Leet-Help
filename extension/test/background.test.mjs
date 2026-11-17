import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
const installId = "3f2b8c1e-8d0a-4b6e-9a57-1c2d3e4f5a6b";

function installWorker(fetchImpl) {
  let messageListener;
  let installListener;
  const stored = { install_id: installId };
  const chrome = {
    runtime: {
      id: "extension-id",
      onInstalled: { addListener(listener) { installListener = listener; } },
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      local: {
        async get() { return stored; },
        async set(value) { Object.assign(stored, value); },
      },
    },
  };
  vm.runInNewContext(workerSource, {
    chrome,
    fetch: fetchImpl,
    crypto: { randomUUID: () => installId },
    TextEncoder,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    RegExp,
    Error,
  });
  return { chrome, get messageListener() { return messageListener; }, get installListener() { return installListener; } };
}

function body() {
  return {
    submission_id: "2196513173",
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    topic_tags: ["Array"],
    lang: "cpp",
    code: "class Solution {}",
    verdict: { total_correct: 953 },
    history: [],
  };
}

const result = {
  rubric_version: "v1",
  scores: { quality: 7, readability: 8, concept: 6 },
  complexity: { time: "O(n^2)", space: "O(1)" },
  suggested: { approach: "Hash map", time: "O(n)", space: "O(n)" },
  concepts: ["Hash Table"],
  hint: null,
};

test("service worker uses only the compiled Flask URL and adds install identity", async () => {
  let requestUrl;
  let requestInit;
  const worker = installWorker(async (url, init) => {
    requestUrl = url;
    requestInit = init;
    return { ok: true, status: 200, json: async () => result };
  });
  let response;
  const keepAlive = worker.messageListener(
    { type: "ANALYZE", body: body() },
    { id: "extension-id", tab: { url: "https://leetcode.com/problems/two-sum/" } },
    (value) => { response = value; },
  );
  assert.equal(keepAlive, true);
  for (let i = 0; i < 10 && response === undefined; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(requestUrl, "http://127.0.0.1:5000/api/v1/analyze");
  assert.equal(requestInit.headers["X-Install-Id"], installId);
  assert.equal(JSON.parse(requestInit.body).install_id, installId);
  assert.equal(response.ok, true);
  assert.equal(response.data.rubric_version, "v1");
});

test("service worker rejects untrusted senders and malformed messages", async () => {
  let fetchCount = 0;
  const worker = installWorker(async () => {
    fetchCount += 1;
    throw new Error("Must not fetch");
  });
  let forbidden;
  worker.messageListener(
    { type: "ANALYZE", body: body() },
    { id: "other-extension", tab: { url: "https://leetcode.com/problems/two-sum/" } },
    (value) => { forbidden = value; },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(forbidden.ok, false);

  let invalid;
  worker.messageListener(
    { type: "ANALYZE", body: { ...body(), url: "https://attacker.example/" } },
    { id: "extension-id", tab: { url: "https://leetcode.com/problems/two-sum/" } },
    (value) => { invalid = value; },
  );
  assert.equal(invalid.ok, false);
  assert.equal(fetchCount, 0);
});
