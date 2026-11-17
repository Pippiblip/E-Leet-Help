import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const hookSource = await readFile(new URL("../dist/hook.js", import.meta.url), "utf8");

function installHook() {
  const messages = [];
  const responses = [];
  const originalFetch = (...args) => {
    assert.equal(args.length > 0, true);
    return Promise.resolve(responses.shift());
  };
  const window = {
    fetch: originalFetch,
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    },
  };
  const location = {
    href: "https://leetcode.com/problems/two-sum/",
    origin: "https://leetcode.com",
  };
  const sandbox = { window, location, URL, Request, Map, Set, Date, Promise, Reflect, RegExp, String, Number, JSON };
  vm.runInNewContext(hookSource, sandbox);
  return { window, location, messages, responses, originalFetch };
}

function response(data) {
  return {
    ok: true,
    clone: () => ({ json: async () => data }),
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("forwards the original fetch response and emits only accepted allowlisted fields", async () => {
  const { window, messages, responses, originalFetch } = installHook();
  const submitted = response({ submission_id: 2_196_513_173 });
  responses.push(submitted);
  const init = { method: "POST" };
  Object.defineProperty(init, "body", {
    get() {
      throw new Error("The hook must never inspect the request body.");
    },
  });
  const returned = await window.fetch("/problems/two-sum/submit/", init);
  assert.equal(returned, submitted);
  assert.notEqual(window.fetch, originalFetch);

  responses.push(response({
    state: "SUCCESS",
    status_code: 10,
    submission_id: "2196513173",
    status_msg: "Accepted",
    status_runtime: "364 ms",
    total_correct: 953,
    code_output: "must not be forwarded",
    compare_result: "must not be forwarded",
  }));
  await window.fetch("/submissions/detail/2196513173/check/", { method: "GET" });
  await settle();

  assert.equal(messages.length, 1);
  assert.equal(messages[0].targetOrigin, "https://leetcode.com");
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].data.payload)), {
    submission_id: "2196513173",
    slug: "two-sum",
    status_code: 10,
    status_msg: "Accepted",
    status_runtime: "364 ms",
    total_correct: 953,
  });
});

test("does not emit for non-accepted or untracked submissions", async () => {
  const { window, messages, responses } = installHook();
  responses.push(response({ submission_id: 10 }));
  await window.fetch("/problems/two-sum/submit/", { method: "POST" });
  responses.push(response({ state: "SUCCESS", status_code: 11, submission_id: "10" }));
  await window.fetch("/submissions/detail/10/check/", { method: "GET" });

  responses.push(response({ state: "SUCCESS", status_code: 10, submission_id: "11" }));
  await window.fetch("/submissions/detail/11/check/", { method: "GET" });
  await settle();
  assert.equal(messages.length, 0);
});

test("accepts the current LeetCode v2 check endpoint shape", async () => {
  const { window, messages, responses } = installHook();
  responses.push(response({ submission_id: 2196513173 }));
  await window.fetch("/problems/two-sum/submit/", { method: "POST" });
  responses.push(response({
    state: "SUCCESS",
    status_code: 10,
    submission_id: "2196513173",
    status_msg: "Accepted",
  }));
  await window.fetch("/submissions/detail/2196513173/v2/check/", { method: "GET" });
  await settle();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.payload.submission_id, "2196513173");
});

test("ignores fetches to unrelated paths and methods", async () => {
  const { window, messages, responses } = installHook();
  responses.push(response({ submission_id: 10 }));
  await window.fetch("/problems/two-sum/submit/", { method: "GET" });
  responses.push(response({ state: "SUCCESS", status_code: 10, submission_id: "10" }));
  await window.fetch("/submissions/detail/10/check/", { method: "POST" });
  await window.fetch("https://leetcode.com/problems/two-sum/interpret_solution/", { method: "POST" });
  await settle();
  assert.equal(messages.length, 0);
});
