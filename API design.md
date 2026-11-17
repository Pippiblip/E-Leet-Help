# API design: MVP and production product

This design builds on the [MVP spec](./LeetCode%20analysis%20companion%20MVP%20spec.md) and its [connector and stack inventory](./MVP%20connectors%20and%20frontend%20stack.md).

## 1. Design goals and assumptions

### MVP

- Chrome extension only; no account, application server, sync service, or MCP server.
- Keep analysis, review scheduling, settings, and event records on-device.
- The user explicitly initiates analysis. Code is sent only to the selected model provider, or processed by an available on-device model.
- Define stable internal contracts now so the UI and storage can later move behind a server without being coupled to Chrome APIs.

### Production product

This section assumes a future product with accounts and cross-device history. The service owns account-scoped analysis metadata, reviews, and sync; it may optionally run analysis through a managed model provider. This is a proposed direction, not a requirement from the MVP spec.

- Keep the client-facing domain contract compatible with the MVP where possible.
- Make source-code handling explicit. Do not retain source code by default.
- Support two analysis modes: BYOK (provider key stays on the client and code is sent directly to that provider) and managed (code is sent to this service for analysis by its configured provider).
- Keep provider credentials, LeetCode credentials, and model-provider secrets out of the product API.
- Do not add LeetCode scraping, notification pushes, streaks, leaderboards, or MCP dependencies as part of this API design.

## 2. Shared domain contract

Use the same normalized result shape in the MVP and production API. Store `schemaVersion` and `rubricVersion` with every analysis; clients must tolerate additive fields and reject unsupported major schema versions.

### Analysis

```json
{
  "id": "ana_01J...",
  "schemaVersion": "1.0",
  "problem": {
    "slug": "two-sum",
    "title": "Two Sum"
  },
  "language": "python",
  "codeHash": "sha256:...",
  "codeRetention": "hash_only",
  "primaryPattern": "hash map",
  "scores": {
    "quality": {
      "value": 7,
      "reason": "One pass avoids repeated scans.",
      "evidence": ["The lookup map is updated as the list is traversed."]
    },
    "readability": {
      "value": 8,
      "reason": "The lookup and return paths are easy to follow.",
      "evidence": ["Early return makes the matching case clear."]
    },
    "concept": {
      "value": 7,
      "reason": "A hash map fits the complement lookup.",
      "evidence": ["Each value is checked against its complement."]
    }
  },
  "complexity": {
    "current": {
      "approach": "Single-pass hash map",
      "time": "O(n)",
      "space": "O(n)",
      "confidence": "static_and_llm_agree"
    },
    "suggested": {
      "approach": "Single-pass hash map",
      "time": "O(n)",
      "space": "O(n)",
      "confidence": "llm_claimed"
    }
  },
  "concepts": [
    {
      "name": "Complement lookup",
      "why": "Find the needed partner in constant expected time.",
      "patternTag": "hash map"
    }
  ],
  "recommendations": [],
  "hints": {
    "repeatedWork": "",
    "bottleneck": "",
    "structure": ""
  },
  "rubricVersion": "2026-11",
  "model": {
    "provider": "user-selected",
    "name": "configured-model"
  },
  "createdAt": "2026-11-06T06:00:00Z"
}
```

Contract rules:

- Scores are integers from 0 to 10. Reasons are at most 140 characters; recommendations at most 200 characters and name a specific change.
- A score of 9 or 10 requires at least two evidence items; otherwise the domain validator clamps it to 8. Evidence should describe lines or constructs, not fabricate line numbers.
- Concepts are limited to 1–3; each `why` is at most 100 characters and `patternTag` must be from the versioned pattern taxonomy or `other`.
- Complexity values use the fixed enum: `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`, `O(n^3)`, `O(2^n)`, `O(n!)`, `other`.
- Current-complexity confidence is one of `static_and_llm_agree`, `llm_only`, `disagree_check_this`; suggested complexity confidence is always `llm_claimed`.
- Hints are generated only for low-score items; each layer is at most 100 characters. Reject code fences and numbered procedures, retry once, then return a readable analysis failure.
- Deltas and milestone eligibility are derived from history and rubric version; do not persist them as facts on the analysis record.
- Persist a code hash by default. Include raw code in a record only when the user opted into code retention.

### Review

```json
{
  "id": "rev_01J...",
  "problemSlug": "two-sum",
  "step": 0,
  "dueAt": "2026-11-07T06:00:00Z",
  "lowestScore": 5,
  "sourceAnalysisId": "ana_01J...",
  "status": "due",
  "updatedAt": "2026-11-06T06:00:00Z"
}
```

`step` is 0–3, corresponding to the fixed 1, 3, 7, and 21-day ladder. A successful re-attempt advances one step; a low-score re-attempt resets to step 0. Status is `due`, `done`, or `snoozed`. The threshold and schedule are product rules and should be versioned if changed.

### Derived progress

Represent score changes as a response projection, not a stored analysis field:

```json
{
  "baseline": {
    "kind": "same_problem",
    "analysisId": "ana_previous",
    "rubricVersion": "2026-11"
  },
  "scores": {
    "quality": { "change": 2, "display": "improved" },
    "readability": { "change": 1, "display": "within_noise" },
    "concept": { "change": 0, "display": "unchanged" }
  },
  "complexity": {
    "time": { "from": "O(n^2)", "to": "O(n)", "display": "improved" }
  }
}
```

Use the spec's baseline order: latest same-problem analysis; otherwise median of the last five analyses for the same pattern if at least three exist; otherwise no baseline. Never compare across rubric versions. For the MVP, one point is displayed as `within_noise`.

## 3. MVP API: local contracts, no HTTP server

The MVP has three API boundaries. Keep them separate so the page detector cannot call the model or write arbitrary storage.

### A. Content script ↔ extension messages

Use a discriminated, runtime-validated message envelope. Every message has a unique `requestId`; replies correlate to it and are either `ok` or a typed error.

```ts
type ExtensionRequest =
  | {
      type: "submission.accepted";
      requestId: string;
      payload: { problemSlug: string; title: string; detectedAt: string };
    }
  | {
      type: "analysis.request";
      requestId: string;
      payload: {
        problemSlug: string;
        title: string;
        language: string;
        code: string;
        acceptedAt: string;
        statement?: string;
      };
    }
  | {
      type: "analysis.open";
      requestId: string;
      payload: { analysisId: string };
    }
  | {
      type: "review.open";
      requestId: string;
      payload: { problemSlug: string };
    };

type ExtensionReply<T> =
  | { requestId: string; ok: true; data: T }
  | {
      requestId: string;
      ok: false;
      error: {
        code:
          | "INVALID_MESSAGE"
          | "UNAUTHORIZED_SENDER"
          | "EDITOR_UNAVAILABLE"
          | "ANALYSIS_FAILED"
          | "STORAGE_FAILED";
        message: string;
        retryable: boolean;
      };
    };
```

Message behavior:

- `submission.accepted` contains no code and may only trigger the opt-in toast; it never starts analysis.
- The Analyze click causes the page-context reader to retrieve the editor code. The resulting `analysis.request` goes directly to the side-panel analysis service, not through the service worker for model execution.
- Validate the sender extension ID, tab URL (`https://leetcode.com/*`), message shape, and payload size. Never trust an arbitrary message just because it has the right `type`.
- Do not put source code, API keys, or full provider errors in logs or analytics.
- Make tab/window identifiers transport metadata, not domain identifiers stored in analysis records.

### B. Side-panel application services

Expose typed interfaces, independent of Chrome and IndexedDB:

```ts
interface AnalysisService {
  analyze(input: AnalyzeInput, signal?: AbortSignal): Promise<Analysis>;
  get(analysisId: string): Promise<Analysis | null>;
  list(query: AnalysisQuery): Promise<Page<Analysis>>;
  progress(analysisId: string): Promise<AnalysisProgress>;
}

interface ReviewService {
  listDue(query: DueReviewQuery): Promise<Page<Review>>;
  complete(reviewId: string, outcome: "above_threshold" | "at_or_below_threshold"): Promise<Review>;
  snooze(reviewId: string, until: string): Promise<Review>;
}

interface SettingsService {
  get(): Promise<Settings>;
  update(patch: SettingsPatch): Promise<Settings>;
  exportData(): Promise<Blob>;
  deleteAll(): Promise<void>;
}
```

Implement these with local repositories over IndexedDB and `chrome.storage.local`. `list` APIs should use explicit, bounded pagination even locally so switching to server-backed lists does not force a UI redesign.

### C. Model-provider adapter

Define a provider-neutral interface; use the provider's documented HTTPS API underneath. Provider choice and exact endpoint are configuration, not part of this app's public contract.

```ts
interface ModelProvider {
  analyze(request: ModelAnalysisRequest, signal?: AbortSignal): Promise<unknown>;
}

type ModelAnalysisRequest = {
  problem: { slug: string; title: string; statement?: string };
  language: string;
  code: string;
  staticSignals?: PythonStaticSignals;
  rubricVersion: string;
  patternTaxonomyVersion: string;
};
```

- Request deterministic generation (`temperature: 0`) and structured/JSON-schema output when supported by the selected provider.
- Validate provider output against the domain contract before rules run or data is saved.
- Permit one retry for invalid structured output; do not retry permanent authorization, permission, or quota errors.
- Do not silently substitute a different model/provider. Surface provider, permission, timeout, invalid-output, and quota failures as distinct readable errors.
- Hash/cache using code hash + rubric version + provider/model identity + prompt/schema version. Do not cache across model or rubric changes.
- Keep the provider key in `chrome.storage.local` only for this MVP, disclose plaintext storage in settings, and never send it to the service worker or persist it in analysis records.
- Direct browser-to-provider use requires an origin permission for the chosen provider. Gemini Nano implements the same interface and remains entirely local.

### MVP sequence

```text
LeetCode Accepted detector
  -> submission.accepted (metadata only)
  -> opt-in toast
  -> Analyze click
  -> page-context code read
  -> analysis.request to side panel
  -> code hash/cache lookup
  -> Python static analysis, if applicable
  -> provider adapter or Gemini Nano
  -> validate + enforce rubric/hint rules
  -> local IndexedDB write + review update
  -> derive deltas/milestones and render
```

There are no app-owned HTTP endpoints in this deployment.

## 4. Production API: versioned service

### Service boundaries

```text
Extension / future clients
  -> API gateway (auth, quotas, request IDs)
  -> account and preferences service
  -> analysis service -> queue/workers -> provider adapter(s)
  -> history/review service
  -> account export/deletion worker
```

- API transport: HTTPS JSON REST, base path `/v1`, OpenAPI 3.1 contract.
- Analysis execution is asynchronous so model latency, provider outages, retries, and rate limits do not hold open an HTTP request.
- Use a relational primary store for account-scoped records and a queue for jobs. Provider keys are not stored in the account database.
- Persist analysis metadata and result. Persist raw code only when the account opted into retention; otherwise discard it after job completion, including failure paths.
- Keep computation adapters and domain contracts provider-neutral so the managed provider can change without changing the client API.

### Authentication and account scope

- Authenticate the extension as a public OAuth client using Authorization Code + PKCE through a trusted identity provider. No client secret is embedded in the extension.
- Use short-lived access tokens and rotating refresh tokens kept in the extension's protected local storage where available. Never put tokens in URLs or logs.
- API derives `userId` from the verified token. Ignore any caller-supplied owner or tenant ID for authorization decisions.
- Require authorization checks on every object lookup, export, delete, job, and review operation; return the same not-found response for absent and foreign-owned object IDs.
- If teams are ever introduced, add an explicit organization scope and membership checks; do not infer multi-tenancy from user-controlled request fields.

### Endpoint catalog

All paths below are under `/v1`. JSON uses camelCase. IDs are opaque and carry no user data.

| Method and path | Purpose |
| --- | --- |
| `GET /me` | Return the authenticated user's profile and product entitlements. |
| `GET /me/preferences` | Read syncable preferences; never return provider secrets. |
| `PATCH /me/preferences` | Update validated preferences using partial-update semantics. |
| `POST /analysis-jobs` | Enqueue an analysis. Requires an `Idempotency-Key`; returns `202 Accepted`. |
| `GET /analysis-jobs/{jobId}` | Read job state and, on completion, its analysis ID. |
| `POST /analysis-jobs/{jobId}:cancel` | Best-effort cancellation before provider execution; return the terminal or current state. |
| `POST /analyses` | Sync a completed BYOK-direct analysis result without uploading source code. Requires an `Idempotency-Key`. |
| `GET /analyses` | List analyses with bounded cursor pagination and filters. |
| `GET /analyses/{analysisId}` | Read one owned analysis. |
| `DELETE /analyses/{analysisId}` | Delete one analysis and its dependent review references according to retention rules. |
| `GET /analyses/{analysisId}/progress` | Compute deltas and milestone projection against compatible history. |
| `GET /reviews` | List due/upcoming reviews with `status`, `dueBefore`, and cursor filters. |
| `POST /reviews/{reviewId}:complete` | Complete a re-attempt and advance/reset the schedule from its outcome. |
| `POST /reviews/{reviewId}:snooze` | Snooze until an explicit allowed timestamp. |
| `POST /me/exports` | Create an account data export job. |
| `GET /me/exports/{exportId}` | Read export state and a short-lived download URL when ready. |
| `DELETE /me` | Start account deletion and deletion of associated data; returns `202` with an operation ID. |

`GET /analyses` supports `problemSlug`, `primaryPattern`, `createdAfter`, `createdBefore`, `limit` (default 25, max 100), and opaque `cursor`. Sort is stable by `createdAt` descending and ID descending. Do not support arbitrary sort expressions.

Do not expose a server event-ingestion endpoint by default. If product analytics are later added, make them opt-in, use an allowlisted event schema, and never ingest code, prompt text, API keys, problem statements, or raw provider responses.

### Managed analysis job request

```http
POST /v1/analysis-jobs
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: 41ce0ec9-...
X-Client-Version: 1.4.0
```

```json
{
  "problem": {
    "slug": "two-sum",
    "title": "Two Sum"
  },
  "language": "python",
  "code": "class Solution: ...",
  "codeHash": "sha256:...",
  "codeRetention": "hash_only",
  "modelPreference": "default",
  "rubricVersion": "2026-11",
  "clientContext": {
    "acceptedAt": "2026-11-06T06:00:00Z",
    "extensionVersion": "1.4.0"
  }
}
```

Rules:

- `code` is required for analysis; `codeHash` must match the server-computed hash. Reject mismatches rather than trusting a client cache key.
- `codeRetention` is `hash_only` or `retain_with_consent`. Require explicit account consent before honoring the latter; omission defaults to `hash_only`.
- This endpoint is only for managed inference. BYOK-direct mode must not upload source code to this endpoint.
- Never accept a raw prompt, arbitrary provider URL, provider key, arbitrary model system instruction, or LeetCode session credential.
- For the default MVP-compatible privacy posture, omit `statement`. If a future product supports statement input, require explicit opt-in, do not persist it, and document provider disclosure.
- Enforce body-size and code-length limits before queueing. Return a validation error with field paths for violations.

Accepted response:

```http
HTTP/1.1 202 Accepted
Location: /v1/analysis-jobs/job_01J...
Retry-After: 2
```

```json
{
  "jobId": "job_01J...",
  "status": "queued",
  "createdAt": "2026-11-06T06:00:00Z",
  "statusUrl": "/v1/analysis-jobs/job_01J..."
}
```

Job states are `queued`, `running`, `succeeded`, `failed`, `cancelled`. A succeeded job includes `analysisId`; a failed job exposes a stable public error code and retryability, never stack traces, provider response bodies, or secrets. Clients poll with `Retry-After` and bounded backoff with jitter. Optional server-sent events may be added later; they are not required for the initial production API.

### BYOK-direct result sync

When cloud history is enabled, BYOK-direct clients call the provider themselves and may sync the normalized result. This endpoint receives no code and no provider credential:

```http
POST /v1/analyses
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: 6209c7d8-...
```

```json
{
  "schemaVersion": "1.0",
  "problem": { "slug": "two-sum", "title": "Two Sum" },
  "language": "python",
  "codeHash": "sha256:...",
  "codeRetention": "hash_only",
  "primaryPattern": "hash map",
  "scores": {},
  "complexity": {},
  "concepts": [],
  "recommendations": [],
  "hints": {},
  "rubricVersion": "2026-11",
  "model": {
    "provider": "user-selected",
    "name": "configured-model"
  }
}
```

The server validates the result schema, enforces size/length limits and account ownership, records its provenance as `byok_direct`, and returns `201 Created` with the canonical analysis. It cannot attest to the client's provider output; clients should label that provenance accurately. If the user has not enabled cloud history, keep the result local instead.

### Idempotency and concurrency

- Scope idempotency keys to authenticated user + method + path. Retain the request fingerprint and final response for at least 24 hours.
- Repeating the same key and same request returns the original job/result; same key with a different normalized payload returns `409 IDEMPOTENCY_KEY_REUSED`.
- Compute a server-side deduplication key from user ID + code hash + rubric + model/prompt version. Deduplicate only compatible in-flight jobs; do not merge records across users.
- A cached analysis is reusable only when its code hash, rubric, prompt/schema version, provider/model, and analysis settings match.
- Reviews use optimistic concurrency with `ETag`/`If-Match` or a version field. Stale updates return `409 VERSION_CONFLICT`; completion must be atomic with schedule advancement.

### List and progress responses

Use cursor-based pagination:

```json
{
  "data": [],
  "page": {
    "nextCursor": "opaque-or-null",
    "hasMore": false
  }
}
```

`GET /analyses/{id}/progress` returns the shared derived-progress shape. It must:

- Exclude the current analysis from its baseline.
- Compare only matching `rubricVersion` values.
- Apply same-problem first, then the median of up to five same-pattern analyses (minimum three).
- Return a no-baseline reason such as `first_solve_in_pattern` or `rubric_mismatch`; never convert missing comparisons to zero deltas.
- Derive milestone eligibility from current authorized history and return a stable `milestoneKey` so duplicate job polling cannot replay an animation.

### Error contract

Use RFC 9457 Problem Details with a stable extension code:

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/v1/analysis-jobs",
  "code": "VALIDATION_ERROR",
  "requestId": "req_01J...",
  "errors": [
    {
      "path": "language",
      "code": "UNSUPPORTED_LANGUAGE",
      "message": "Language is not supported."
    }
  ]
}
```

Recommended status mapping:

| Status | Example codes | Client behavior |
| --- | --- | --- |
| `400` | `MALFORMED_JSON`, `INVALID_CURSOR` | Correct request; do not retry unchanged. |
| `401` | `TOKEN_EXPIRED`, `INVALID_TOKEN` | Refresh once, then require sign-in. |
| `403` | `ENTITLEMENT_REQUIRED`, `CONSENT_REQUIRED` | Explain the missing permission/entitlement. |
| `404` | `NOT_FOUND` | Treat missing and foreign-owned resources identically. |
| `409` | `IDEMPOTENCY_KEY_REUSED`, `VERSION_CONFLICT` | Reconcile state; do not blindly retry. |
| `413` | `PAYLOAD_TOO_LARGE` | Ask user to reduce input; do not retry unchanged. |
| `422` | `VALIDATION_ERROR`, `UNSUPPORTED_LANGUAGE` | Show field-level error. |
| `429` | `RATE_LIMITED`, `QUOTA_EXCEEDED` | Honor `Retry-After`; distinguish temporary rate limiting from exhausted quota. |
| `502`/`503` | `PROVIDER_UNAVAILABLE`, `SERVICE_UNAVAILABLE` | Retry only when marked retryable, with bounded backoff. |
| `504` | `ANALYSIS_TIMEOUT` | Show a recoverable failure; safely retry using the same idempotency key. |

Every response includes `X-Request-Id`. Public errors are safe and actionable; detailed diagnostics remain in access-controlled server logs with sensitive fields redacted.

### Rate limiting

Apply limits by authenticated account, operation, and (for analysis) entitlement. Return `429`, a stable error code, and `Retry-After`. Protect expensive analysis separately from reads. Do not use client IP as the sole user quota key. Publish limits in product documentation rather than baking provider-specific quota assumptions into the API.

## 5. Production security, privacy, and operations

- Enforce TLS, strict CORS for approved extension origins, request size limits, JSON content types, and schema validation at the gateway and service boundary.
- Treat submitted code and model output as untrusted content. Render as text, never HTML; do not execute submitted code.
- Apply output validation and the score-evidence clamp on the server for managed analysis. Client checks remain defense-in-depth only.
- Keep provider credentials in a dedicated secret manager for managed inference. For BYOK-direct mode, use the provider permission and key handling described by the MVP; a client-supplied key must never be accepted by the product API.
- Redact code, statements, tokens, provider keys, and raw prompts from logs, traces, crash reports, and analytics. Record only operational metadata needed for reliability and cost controls.
- Encrypt persistent data in transit and at rest; isolate access by account; audit administrative access.
- Use explicit retention periods. Deletion covers primary rows, search/index copies, exports, and queued jobs; document the backup-expiry window rather than claiming instant physical erasure.
- Keep a privacy export in a common JSON format and make account deletion asynchronous but observable through an operation status.
- Make server analytics opt-in and separate from user-visible `events`. The MVP's toast/hint/milestone events remain local unless the user separately consents to diagnostics.
- Version rubrics, prompt templates, model identifiers, pattern taxonomy, and output schema. Preserve provenance so historical comparisons can refuse incompatible versions.

## 6. Migration path

1. Implement MVP `AnalysisService`, `ReviewService`, and `SettingsService` behind interfaces with local IndexedDB repositories.
2. Keep the shared `Analysis`, `Review`, `Progress`, and error contracts versioned and validated at runtime.
3. Add a server repository implementation for history/reviews and an API client without changing UI components.
4. Introduce account auth and explicit sync consent. Make local-first vs cloud-synced state visible; do not silently upload existing analyses or saved code.
5. Add managed analysis as an explicit mode, keeping BYOK-direct available if it remains a product promise.
6. Add migration/export/delete flows, idempotency, retry behavior, and tenant-isolation tests before enabling cross-device sync broadly.

## 7. Decisions still required for the real product

- Whether managed inference is a core offering, BYOK remains the default, or both modes ship.
- What account identity provider and sign-in UX are supported by the Chrome extension.
- Which analysis fields sync by default and whether code retention is ever offered.
- Retention windows, backup deletion window, data residency, and supported deletion guarantees.
- Product entitlement and quota policy; no pricing model is assumed here.
- Whether a future product includes clients beyond Chrome. This design does not add mobile, other browsers, or LeetCode integrations.

## 8. ASCII design views

These are logical designs, not claims about a specific cloud vendor or final visual styling.

### MVP component architecture

```text
+--------------------------- LeetCode tab ---------------------------+
|                                                                    |
|  +-------------------+        +-------------------------------+   |
|  | Accepted detector |------->| Opt-in toast (closed Shadow DOM)|  |
|  | content script    |        | Analyze / Dismiss               |  |
|  +-------------------+        +---------------+---------------+  |
|                                                 | Analyze click    |
|  +-------------------+                          v                 |
|  | Page-context code |<-------------------------+                 |
|  | reader (Monaco)   |        user gesture only                   |
|  +---------+---------+                                            |
+------------|-------------------------------------------------------+
             | validated extension message; code only after click
             v
+------------------------------ Chrome ------------------------------+
|  +--------------------+       +---------------------------------+  |
|  | MV3 service worker |------>| Side panel application          |  |
|  | route messages     |       | validate -> rules -> render      |  |
|  | no model calls     |       |                                 |  |
|  +--------------------+       | +-----------------------------+ |  |
|                               | | AnalysisService              | |  |
|                               | | cache -> static check -> LLM | |  |
|                               | +-------------+---------------+ |  |
|                               +---------------|-----------------+  |
|                                               |                    |
|                 +-----------------------------+----------------+  |
|                 |                                              |  |
|                 v                                              v  |
|  +---------------------------+                  +----------------+|
|  | IndexedDB                 |                  | Model adapter  ||
|  | analyses/reviews/events   |                  | BYOK provider  ||
|  | variance                   |                 | OR Gemini Nano ||
|  +---------------------------+                  +-------+--------+|
+-----------------------------------------------------------|--------+
                                                            |
                                       BYOK only: code after explicit
                                       action; provider call from panel
                                                            v
                                                     +--------------+
                                                     | User-chosen  |
                                                     | LLM provider |
                                                     +--------------+
```

### MVP analysis sequence

```text
User          LeetCode page       Content script       Side panel       Local DB       Model
 |                  |                   |                   |               |             |
 | Submit solution  |                   |                   |               |             |
 |----------------->|                   |                   |               |             |
 |                  | Accepted          |                   |               |             |
 |                  |------------------>|                   |               |             |
 |                  |                   | show toast        |               |             |
 |                  |                   | (no code read)    |               |             |
 |<-----------------|-------------------|                   |               |             |
 | Analyze click    |                   |                   |               |             |
 |----------------->|------------------>| read editor code  |               |             |
 |                  |                   |------------------>| hash/cache    |             |
 |                  |                   |                   |-------------> |             |
 |                  |                   |                   | cache miss    |             |
 |                  |                   |                   |<------------- |             |
 |                  |                   |                   | static check  |             |
 |                  |                   |                   |-------------> | Analyze     |
 |                  |                   |                   |<------------- | result      |
 |                  |                   |                   | validate/rules|             |
 |                  |                   |                   |-------------> | save result |
 |                  |                   |                   |<------------- |             |
 |<----------------- render scores, comparison, deltas and review date ---- |             |
```

For Gemini Nano, replace the external `Model` call with the on-device runtime; no code leaves the device. A cache hit skips model execution and does not replay milestone animation.

### Minimal panel wireframe

```text
+--------------------------------------+
| Two Sum                         [x]  |
| Python   Analyzed just now           |
+--------------------------------------+
| QUALITY       7/10   +2               |
| One pass avoids repeated scans.       |
| Evidence: lookup map updated per item |
|-------------------------------------- |
| READABILITY   8/10   within noise     |
| Clear lookup and early return.        |
|--------------------------------------|
| CONCEPT       7/10   +1               |
| Hash map fits complement lookup.      |
+--------------------------------------+
| YOURS              SUGGESTED          |
| Hash map           Hash map           |
| Time   O(n)        Time   O(n)        |
| Space  O(n)        Space  O(n)        |
| Static + LLM agree  LLM-claimed       |
+--------------------------------------+
| Re-attempt on Nov 7                    |
| Hint 1: [Reveal repeated work]         |
| [Due reviews]                  [Prefs] |
+--------------------------------------+
```

The wireframe is only a content hierarchy: preserve the spec's 360 px target, no-scroll analysis view where feasible, accessible controls, and reduced-motion behavior.

### Production service topology

```text
                    +-------------------------+
                    | Extension / future UI   |
                    | OAuth PKCE; no secret   |
                    +------------+------------+
                                 |
                              HTTPS /v1
                                 |
                    +------------v------------+
                    | API gateway             |
                    | auth, schema, quota,    |
                    | request ID, idempotency |
                    +--+-------------------+--+
                       |                   |
          +------------v------+    +-------v----------------+
          | Account/preferences|    | Analysis API           |
          | API                |    | create job / poll job  |
          +---------+----------+    +-----------+------------+
                    |                           |
                    |                    +------v-------+
                    |                    | Durable queue |
                    |                    +------+-------+
                    |                           |
          +---------v---------------------------v---------+
          | Relational data store                         |
          | users, preferences, analyses, reviews, jobs   |
          +-----------------------------------------------+
                                                |
                                      +---------v----------+
                                      | Isolated worker    |
                                      | validate, analyze, |
                                      | apply rubric rules |
                                      +----+-----------+---+
                                           |           |
                               secrets     |           | discard code
                               manager     v           v
                                      +---------+   +---------+
                                      | Managed |   | Result  |
                                      | model   |   | store   |
                                      | provider|   | metadata|
                                      +---------+   +---------+

 BYOK-direct path: Client -----------------------> User's provider
                  Client -- result only, no code/key --> API /analyses
```

Raw source code exists in the managed worker's processing path only. Unless retention consent is explicit, do not persist it in the relational store, job payloads beyond necessary processing, logs, traces, or failed-job records.

### Production analysis request lifecycle

```text
Client             API Gateway       Analysis API       Queue/Worker       Provider       Database
  |                     |                  |                  |                |            |
  | POST /analysis-jobs |                  |                  |                |              |
  | Idempotency-Key     |                  |                  |                |              |
  |-------------------->| auth + validate  |                  |                |              |
  |                     |----------------->| fingerprint      |                |              |
  |                     |                  | create job       |--------------->|              |
  |                     |                  |------------------ enqueue -------->|              |
  |<-------------------- 202 + jobId -------|                  |                |              |
  |                     |                  |                  | validate input |              |
  |                     |                  |                  |--------------->|              |
  |                     |                  |                  | structured call|              |
  |                     |                  |                  |--------------->|              |
  |                     |                  |                  |<---------------| result       |
  |                     |                  |                  | validate/rules |              |
  |                     |                  |                  |------------------------------>|
  | GET /analysis-jobs/{id} (bounded polling)                  | update status  |              |
  |-------------------->|----------------->|----------------------------------------------->|
  |<--------------------|<-----------------| status/result reference                         |
  | GET /analyses/{id}  |                  |                  |                |              |
  |-------------------->|----------------->|----------------------------------------------->|
  |<--------------------|<-----------------| normalized analysis                             |
```

On provider failure, the worker records a stable failure code and retryability, redacts provider details, and never returns a success-shaped empty analysis. A retried create request with the same idempotency key returns the original job rather than creating duplicate work.
