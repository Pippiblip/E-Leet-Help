import { SUBMISSION_DETAILS_TIMEOUT_MS } from "../shared/constants";
import type { SubmissionDetails } from "../shared/types";

const query = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    code
    statusCode
    lang { name verboseName }
    runtimeDisplay
    memoryDisplay
    question { questionId title titleSlug difficulty }
    topicTags { slug name }
  }
}`;

export class LeetCodeApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "LeetCodeApiError";
  }
}

export async function getSubmissionDetails(id: string): Promise<SubmissionDetails> {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new LeetCodeApiError("The submission ID is invalid.", "INVALID_SUBMISSION_ID");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SUBMISSION_DETAILS_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { submissionId: Number(id) },
        operationName: "submissionDetails",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LeetCodeApiError("LeetCode timed out while fetching the accepted solution.", "LEETCODE_TIMEOUT");
    }
    throw new LeetCodeApiError("Could not fetch the accepted solution from LeetCode.", "LEETCODE_UNAVAILABLE");
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new LeetCodeApiError(
      response.status === 403
        ? "LeetCode rejected the solution request. The site may require an updated CSRF header."
        : `LeetCode returned HTTP ${response.status} while fetching the solution.`,
      response.status === 403 ? "LEETCODE_FORBIDDEN" : "LEETCODE_HTTP_ERROR",
    );
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new LeetCodeApiError("LeetCode returned an invalid response.", "LEETCODE_INVALID_RESPONSE");
  }
  if (!envelope || typeof envelope !== "object") {
    throw new LeetCodeApiError("LeetCode returned an invalid response.", "LEETCODE_INVALID_RESPONSE");
  }
  const result = envelope as {
    errors?: unknown[];
    data?: { submissionDetails?: Record<string, unknown> | null };
  };
  if (Array.isArray(result.errors) && result.errors.length) {
    throw new LeetCodeApiError("LeetCode could not load this submission. The API may have changed.", "LEETCODE_GRAPHQL_ERROR");
  }
  const detail = result.data?.submissionDetails;
  if (!detail || typeof detail !== "object") {
    throw new LeetCodeApiError("LeetCode did not return submission details.", "LEETCODE_MISSING_DETAILS");
  }

  const language = detail.lang as { name?: unknown; verboseName?: unknown } | null;
  const question = detail.question as {
    questionId?: unknown;
    title?: unknown;
    titleSlug?: unknown;
    difficulty?: unknown;
  } | null;
  const tags = Array.isArray(detail.topicTags)
    ? detail.topicTags.flatMap((tag: unknown) => {
      if (!tag || typeof tag !== "object") return [];
      const name = (tag as { name?: unknown }).name;
      return typeof name === "string" ? [name.slice(0, 80)] : [];
    }).slice(0, 20)
    : [];
  if (typeof detail.code !== "string" || !language || !question
    || typeof language.name !== "string" || typeof question.title !== "string"
    || typeof question.titleSlug !== "string" || typeof question.difficulty !== "string"
    || (question.questionId !== undefined && typeof question.questionId !== "string"
      && typeof question.questionId !== "number")) {
    throw new LeetCodeApiError("LeetCode returned incomplete submission details.", "LEETCODE_INVALID_DETAILS");
  }

  const statusCode = typeof detail.statusCode === "number" ? detail.statusCode : undefined;
  if (statusCode !== undefined && statusCode !== 10) {
    throw new LeetCodeApiError("The submission is no longer marked Accepted by LeetCode.", "NOT_ACCEPTED");
  }
  return {
    code: detail.code,
    statusCode,
    lang: language.name,
    langVerbose: typeof language.verboseName === "string" ? language.verboseName : language.name,
    title: question.title.slice(0, 200),
    titleSlug: question.titleSlug,
    difficulty: question.difficulty.slice(0, 40),
    questionId: question.questionId === undefined ? "" : String(question.questionId),
    tags,
  };
}
