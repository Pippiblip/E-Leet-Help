import {
  ANALYZE_TIMEOUT_MS,
  FLASK_BASE_URL,
  INSTALL_ID_STORAGE_KEY,
  MAX_CODE_CHARS,
  MAX_MESSAGE_BYTES,
  MESSAGE_ANALYZE,
} from "../shared/constants";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  RuntimeAnalyzeMessage,
  RuntimeAnalyzeResponse,
  Scores,
} from "../shared/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.storage.local.set({ [INSTALL_ID_STORAGE_KEY]: crypto.randomUUID() });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnalyzeBody(value: unknown): value is RuntimeAnalyzeMessage["body"] {
  if (!isRecord(value) || typeof value.submission_id !== "string"
    || !/^\d+$/.test(value.submission_id) || value.submission_id.length > 32
    || typeof value.slug !== "string" || !/^[a-z0-9-]{1,120}$/i.test(value.slug)
    || typeof value.title !== "string" || !value.title.trim() || value.title.length > 200
    || typeof value.difficulty !== "string" || value.difficulty.length > 40
    || typeof value.lang !== "string" || !value.lang || value.lang.length > 80
    || typeof value.code !== "string" || !value.code.trim() || value.code.length > MAX_CODE_CHARS
    || !Array.isArray(value.topic_tags) || value.topic_tags.length > 20
    || !value.topic_tags.every((tag) => typeof tag === "string" && tag.length <= 80)
    || !isRecord(value.verdict) || !Array.isArray(value.history) || value.history.length > 3) {
    return false;
  }
  const allowedBodyFields = new Set([
    "submission_id", "slug", "title", "difficulty", "topic_tags", "lang", "code", "verdict", "history",
  ]);
  if (Object.keys(value).some((key) => !allowedBodyFields.has(key))) return false;
  const verdict = value.verdict;
  const verdictStrings = ["status_runtime", "status_memory"];
  const verdictNumbers = ["runtime_percentile", "memory_percentile", "total_correct", "total_testcases"];
  const allowedVerdictFields = new Set([...verdictStrings, ...verdictNumbers]);
  if (Object.keys(verdict).some((key) => !allowedVerdictFields.has(key))
    || verdictStrings.some((key) => verdict[key] !== undefined && typeof verdict[key] !== "string")
    || verdictNumbers.some((key) => verdict[key] !== undefined
      && (typeof verdict[key] !== "number" || !Number.isFinite(verdict[key])))) return false;

  return value.history.every((item) => {
    if (!isRecord(item) || typeof item.submission_id !== "string"
      || typeof item.time_complexity !== "string" || typeof item.space_complexity !== "string"
      || typeof item.rubric_version !== "string" || !isRecord(item.scores)) return false;
    if (Object.keys(item).some((key) => !new Set([
      "submission_id", "scores", "time_complexity", "space_complexity", "rubric_version",
    ]).has(key)) || Object.keys(item.scores).some((key) =>
      !["quality", "readability", "concept"].includes(key))) return false;
    const scores = item.scores;
    return ["quality", "readability", "concept"].every((key) =>
      Number.isInteger(scores[key]) && Number(scores[key]) >= 0 && Number(scores[key]) <= 10);
  });
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (!isRecord(value) || typeof value.rubric_version !== "string"
    || !isRecord(value.scores) || !isRecord(value.complexity)
    || !isRecord(value.suggested) || !Array.isArray(value.concepts)
    || value.concepts.length > 5
    || !value.concepts.every((concept) => typeof concept === "string" && concept.length <= 100)
    || (value.hint !== null && (typeof value.hint !== "string" || value.hint.length > 400))) return false;
  const scores = value.scores as unknown as Scores;
  if (!["quality", "readability", "concept"].every((key) =>
    Number.isInteger(scores[key as keyof Scores]) && scores[key as keyof Scores] >= 0 && scores[key as keyof Scores] <= 10)) return false;
  const complexity = value.complexity;
  const suggested = value.suggested;
  const complexityClasses = new Set(["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)", "other"]);
  return typeof complexity.time === "string" && complexity.time.length <= 20
    && typeof complexity.space === "string" && complexity.space.length <= 20
    && typeof suggested.approach === "string" && suggested.approach.length <= 160
    && typeof suggested.time === "string" && suggested.time.length <= 20
    && typeof suggested.space === "string" && suggested.space.length <= 20
    && complexityClasses.has(complexity.time) && complexityClasses.has(complexity.space)
    && complexityClasses.has(suggested.time) && complexityClasses.has(suggested.space);
}

function failure(code: string, message: string): RuntimeAnalyzeResponse {
  return { ok: false, error: { code, message } };
}

async function analyze(message: RuntimeAnalyzeMessage, sender: chrome.runtime.MessageSender): Promise<RuntimeAnalyzeResponse> {
  if (sender.id !== chrome.runtime.id || !sender.tab?.url?.startsWith("https://leetcode.com/")) {
    return failure("forbidden_sender", "Analysis requests must come from a LeetCode tab.");
  }
  if (!isAnalyzeBody(message.body)) {
    return failure("bad_request", "The analysis request is invalid.");
  }
  const encoded = JSON.stringify(message.body);
  if (new TextEncoder().encode(encoded).byteLength > MAX_MESSAGE_BYTES) {
    return failure("payload_too_large", "The analysis request is too large.");
  }

  const stored = await chrome.storage.local.get(INSTALL_ID_STORAGE_KEY);
  let installId = stored[INSTALL_ID_STORAGE_KEY];
  if (typeof installId !== "string" || !uuidPattern.test(installId)) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ [INSTALL_ID_STORAGE_KEY]: installId });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  try {
    const request: AnalyzeRequest = { ...message.body, install_id: installId };
    const response = await fetch(`${FLASK_BASE_URL}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Install-Id": installId,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      return failure("invalid_server_response", "The analysis server returned an invalid response.");
    }
    if (!response.ok) {
      const error = isRecord(responseBody) && isRecord(responseBody.error) ? responseBody.error : null;
      return failure(
        typeof error?.code === "string" ? error.code : "server_error",
        typeof error?.message === "string" ? error.message : `The analysis server returned HTTP ${response.status}.`,
      );
    }
    if (!isRecord(responseBody) || !isAnalyzeResponse(responseBody)) {
      return failure("invalid_server_response", "The analysis server returned an invalid result.");
    }
    return { ok: true, data: responseBody };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return failure("llm_timeout", "Analysis timed out. You can retry.");
    }
    return failure("server_unavailable", "Could not reach the analysis server. Check that it is running, then retry.");
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isRecord(message) || message.type !== MESSAGE_ANALYZE) return undefined;
  if (Object.keys(message).some((key) => !["type", "body"].includes(key))
    || !isAnalyzeBody(message.body)) {
    sendResponse(failure("bad_request", "The analysis request is invalid."));
    return false;
  }
  const requestMessage: RuntimeAnalyzeMessage = { type: MESSAGE_ANALYZE, body: message.body };
  void analyze(requestMessage, sender)
    .then(sendResponse)
    .catch(() => sendResponse(failure("server_error", "The analysis request failed.")));
  return true;
});
