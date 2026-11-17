import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const rubricVersion = "2026-11";
const complexityClasses = new Set([
  "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)", "other",
]);
const patterns = new Set([
  "two pointers", "sliding window", "hash map", "prefix sum", "binary search", "stack",
  "monotonic stack", "heap", "BFS", "DFS", "backtracking", "1D DP", "2D DP", "greedy",
  "intervals", "union-find", "trie", "shortest path", "topological sort", "bit manipulation",
  "math", "sorting", "linked list", "tree traversal", "matrix", "design", "other",
]);

function readEnvFile() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2").trim();
    process.env[match[1]] = value;
  }
}

readEnvFile();

const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4173),
  baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4o-mini",
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateInput(input) {
  if (!input || typeof input !== "object") throw new Error("Analysis input is required.");
  const { problemSlug, title, language, code } = input;
  const threshold = input.threshold === undefined ? 5 : input.threshold;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10) {
    throw new Error("The low-score threshold must be an integer from 0 to 10.");
  }
  if (typeof problemSlug !== "string" || !/^[a-z0-9-]{1,120}$/i.test(problemSlug)) {
    throw new Error("Enter a valid problem slug.");
  }
  if (typeof title !== "string" || !title.trim() || title.length > 160) {
    throw new Error("Enter a problem title (up to 160 characters).");
  }
  if (typeof language !== "string" || !language.trim() || language.length > 60) {
    throw new Error("Choose a programming language.");
  }
  if (typeof code !== "string" || !code.trim() || code.length > 30000) {
    throw new Error("Add solution code (up to 30,000 characters).");
  }
  return { problemSlug: problemSlug.toLowerCase(), title: title.trim(), language: language.trim(), code, threshold };
}

function parseModelContent(content) {
  if (typeof content !== "string") throw new Error("The provider returned no analysis text.");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function shortText(value, maxLength, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The analysis is missing ${field}.`);
  return value.trim().slice(0, maxLength);
}

function normalizeOutput(output, input) {
  if (!output || typeof output !== "object") throw new Error("The model response is not an object.");
  const scoreNames = ["quality", "readability", "concept"];
  const scores = {};
  for (const name of scoreNames) {
    const score = output.scores?.[name];
    if (!score || !Number.isInteger(score.value) || score.value < 0 || score.value > 10 || !Array.isArray(score.evidence)) {
      throw new Error(`The model returned an invalid ${name} score.`);
    }
    const evidence = score.evidence.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 5);
    scores[name] = {
      value: score.value >= 9 && evidence.length < 2 ? 8 : score.value,
      reason: shortText(score.reason, 140, `${name} score reason`),
      evidence,
    };
  }

  const complexity = {};
  for (const name of ["current", "suggested"]) {
    const item = output.complexity?.[name];
    if (!item || !complexityClasses.has(item.time) || !complexityClasses.has(item.space)) {
      throw new Error(`The model returned invalid ${name} complexity classes.`);
    }
    complexity[name] = {
      approach: shortText(item.approach, 120, `${name} approach`),
      time: item.time,
      space: item.space,
      confidence: name === "current" ? "llm_only" : "llm_claimed",
    };
  }

  const concepts = Array.isArray(output.concepts) ? output.concepts.slice(0, 3).map((concept) => ({
    name: shortText(concept.name, 80, "concept name"),
    why: shortText(concept.why, 100, "concept reason"),
    patternTag: patterns.has(concept.patternTag) ? concept.patternTag : "other",
  })) : [];
  if (!concepts.length) throw new Error("The model returned no concepts.");

  const recommendations = Array.isArray(output.recommendations)
    ? output.recommendations.slice(0, 2).map((item) => ({
      text: shortText(typeof item === "string" ? item : item.text, 200, "recommendation"),
    }))
    : [];
  const hints = {};
  const needsHints = Object.values(scores).some((score) => score.value <= input.threshold);
  for (const key of ["repeatedWork", "bottleneck", "structure"]) {
    const hint = typeof output.hints?.[key] === "string" ? output.hints[key].trim().slice(0, 100) : "";
    if (/```|\b\d+[.)]\s/.test(hint)) throw new Error("The model returned a hint with code or numbered steps.");
    hints[key] = needsHints ? hint : "";
  }

  return {
    problemSlug: input.problemSlug,
    primaryPattern: patterns.has(output.primaryPattern) ? output.primaryPattern : "other",
    scores,
    complexity,
    concepts,
    recommendations,
    hints,
  };
}

const systemPrompt = `You are a careful coding-interview reviewer. Analyze only the supplied solution; do not execute it. Return one JSON object with keys primaryPattern, scores, complexity, concepts, recommendations, hints. scores has quality, readability, concept; each has integer value 0-10, a reason <=140 chars, and concrete evidence array. 9-10 requires at least two evidence items. complexity has current and suggested; each has approach, time, space using exactly one of O(1), O(log n), O(n), O(n log n), O(n^2), O(n^3), O(2^n), O(n!), other. concepts is 1-3 objects {name,why,patternTag}; recommendations is at most 2 specific changes. hints has repeatedWork, bottleneck, structure, each <=100 chars, no code and no numbered steps. Allowed pattern tags: two pointers, sliding window, hash map, prefix sum, binary search, stack, monotonic stack, heap, BFS, DFS, backtracking, 1D DP, 2D DP, greedy, intervals, union-find, trie, shortest path, topological sort, bit manipulation, math, sorting, linked list, tree traversal, matrix, design, other. Be concise and honest.`;

function buildPrompt(input, retry = false) {
  return `${retry ? "Your last response did not match the required JSON contract. Correct it and return valid JSON only.\n\n" : ""}Problem: ${input.title} (slug: ${input.problemSlug})
Language: ${input.language}
  Only provide non-empty hint layers if a score is at or below ${input.threshold}/10.

Solution:
\`\`\`${input.language}
${input.code}
\`\`\`

Return the required analysis JSON. Do not invent line numbers.`;
}

async function requestProvider(input) {
  let base;
  try {
    base = new URL(config.baseUrl);
  } catch {
    throw new Error("LLM_BASE_URL in .env must be a valid URL.");
  }
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("LLM_BASE_URL must use HTTP or HTTPS.");
  if (!config.apiKey) {
    const error = new Error("Add your API key to .env, then restart the local app.");
    error.code = "MISSING_API_KEY";
    throw error;
  }
  const endpoint = `${config.baseUrl}/chat/completions`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: buildPrompt(input, attempt > 0) },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });
    } catch (error) {
      const failure = new Error(error.name === "TimeoutError"
        ? "The model provider timed out. Please try again."
        : "Could not connect to the model provider. Check your connection and .env settings.");
      failure.code = error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE";
      throw failure;
    }
    if (!response.ok) {
      const failure = response.status === 401 || response.status === 403
        ? new Error("The provider rejected your API key. Check LLM_API_KEY in .env.")
        : response.status === 429
          ? new Error("The provider rate limit or quota was reached. Try again later.")
          : new Error(`The provider returned HTTP ${response.status}. Check its status and your model settings.`);
      failure.code = response.status === 401 || response.status === 403
        ? "INVALID_API_KEY"
        : response.status === 429 ? "PROVIDER_QUOTA" : "PROVIDER_ERROR";
      throw failure;
    }
    let envelope;
    try {
      envelope = await response.json();
      const content = envelope.choices?.[0]?.message?.content;
      return normalizeOutput(parseModelContent(content), input);
    } catch (error) {
      if (attempt === 1) {
        const failure = new Error("The provider returned invalid analysis twice. Try again or choose another model.");
        failure.code = "INVALID_MODEL_OUTPUT";
        throw failure;
      }
    }
  }
  throw new Error("Analysis failed.");
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const file = path.resolve(publicRoot, `.${requested}`);
  if (!file.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(file);
    const extension = path.extname(file);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, model: config.model, providerConfigured: Boolean(config.apiKey) });
  }
  if (request.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const input = validateInput(await readJson(request));
      const result = await requestProvider(input);
      return sendJson(response, 200, { result, model: config.model, rubricVersion });
    } catch (error) {
      const status = error.status || (error.code === "MISSING_API_KEY" ? 503 : 400);
      return sendJson(response, status, {
        error: {
          code: error.code || "INVALID_REQUEST",
          message: error.message || "Analysis request failed.",
        },
      });
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end();
    return;
  }
  await serveStatic(url.pathname, response);
});

server.listen(config.port, config.host, () => {
  console.log(`Hiregram local MVP is running at http://${config.host}:${config.port}`);
  console.log(`Model configured: ${config.model}; API key: ${config.apiKey ? "set" : "not set"}`);
});
