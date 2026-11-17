import { PAGE_MESSAGE_SOURCE, PAGE_MESSAGE_VERSION } from "../shared/constants";
import type { AcceptedPayload } from "../shared/types";

const hookWindow = window as Window & { __lcAnalyzerFetchHookV1?: boolean };
if (hookWindow.__lcAnalyzerFetchHookV1) {
  // The main-world bundle can be evaluated more than once during SPA navigation.
} else {
  hookWindow.__lcAnalyzerFetchHookV1 = true;

  const originalFetch = window.fetch;
  const pending = new Map<string, { slug: string; ts: number }>();
  const maxPending = 20;
  const maxAgeMs = 10 * 60 * 1000;
  const submitPath = /^\/problems\/([^/]+)\/submit\/?$/;
  const checkPath = /^\/submissions\/detail\/(\d+)(?:\/v\d+)?\/check\/?$/;

  function prunePending(now: number): void {
    for (const [id, entry] of pending) {
      if (now - entry.ts > maxAgeMs) pending.delete(id);
    }
    while (pending.size > maxPending) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
  }

  function requestUrl(input: RequestInfo | URL): URL | null {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.hostname === "leetcode.com" ? url : null;
    } catch {
      return null;
    }
  }

  function postAccepted(payload: AcceptedPayload): void {
    window.postMessage({
      source: PAGE_MESSAGE_SOURCE,
      v: PAGE_MESSAGE_VERSION,
      type: "ACCEPTED",
      payload,
    }, location.origin);
  }

  async function inspectResponse(url: URL, response: Response): Promise<void> {
    const now = Date.now();
    prunePending(now);

    const submit = submitPath.exec(url.pathname);
    if (submit) {
      if (!response.ok) return;
      const body: unknown = await response.clone().json();
      if (!body || typeof body !== "object") return;
      const submissionId = (body as { submission_id?: unknown }).submission_id;
      if ((typeof submissionId !== "number" && typeof submissionId !== "string")
        || !/^\d+$/.test(String(submissionId))) return;
      pending.set(String(submissionId), { slug: submit[1], ts: now });
      prunePending(now);
      return;
    }

    const check = checkPath.exec(url.pathname);
    if (!check || !response.ok) return;
    const body: unknown = await response.clone().json();
    if (!body || typeof body !== "object") return;
    const result = body as Record<string, unknown>;
    if (result.state !== "SUCCESS") return;

    const responseId = typeof result.submission_id === "number" || typeof result.submission_id === "string"
      ? String(result.submission_id)
      : check[1];
    const entry = pending.get(responseId);
    if (!entry || Date.now() - entry.ts > maxAgeMs) return;
    pending.delete(responseId);
    if (result.status_code !== 10) return;

    const payload: AcceptedPayload = {
      submission_id: responseId,
      slug: entry.slug,
      status_code: 10,
    };
    const allowed = [
      "status_msg", "lang", "pretty_lang", "question_id", "status_runtime", "status_memory",
      "runtime_percentile", "memory_percentile", "total_correct", "total_testcases",
    ] as const;
    for (const key of allowed) {
      const value = result[key];
      if (typeof value === "string" || typeof value === "number") {
        Object.assign(payload, { [key]: value });
      }
    }
    postAccepted(payload);
  }

  function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    return method.toUpperCase();
  }

  window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    const url = requestUrl(args[0]);
    const method = requestMethod(args[0], args[1]);
    const responsePromise = Reflect.apply(originalFetch, this, args) as ReturnType<typeof fetch>;
    if (url) {
      const isSubmit = method === "POST" && submitPath.test(url.pathname);
      const isCheck = method === "GET" && checkPath.test(url.pathname);
      if (isSubmit || isCheck) {
        void responsePromise.then((response) => inspectResponse(url, response)).catch(() => undefined);
      }
    }
    return responsePromise;
  };
}
