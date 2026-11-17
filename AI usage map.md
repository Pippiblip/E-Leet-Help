# AI usage map

This document maps every planned AI-model use in the [MVP spec](./LeetCode%20analysis%20companion%20MVP%20spec.md) and [API design](./API%20design.md). It distinguishes model inference from autonomous agents and from deterministic application logic.

## At a glance

- **MVP:** AI is used only when the user explicitly clicks **Analyze** after an Accepted submission. The extension sends the solution to the user's chosen LLM provider, or optionally analyzes it with on-device Gemini Nano.
- **Autonomous agents:** None. There is no AI agent that plans tasks, takes actions, browses LeetCode, runs code, or continues working independently. The analysis model receives one bounded request and returns structured feedback.
- **Production proposal:** The product could retain the same user-triggered model call, either directly to a BYOK provider or through a managed analysis job. A queue/worker is ordinary backend infrastructure, not an AI agent.
- **MCPs:** None required or used by the shipped product.

## Exact AI call boundary

```text
Accepted detected
      |
      v
Show opt-in toast               No AI call; no code read
      |
      | user clicks Analyze
      v
Read current solution code      No AI call
      |
      v
Hash/cache lookup               No AI call on a compatible cache hit
      |
      +---- Python static checks (if Python)    No AI call
      |
      v
Build one bounded analysis request
      |
      +---- BYOK mode ------> User-selected LLM provider
      |
      +---- Optional local -> Gemini Nano runtime
      |
      v
Validate structured output and apply deterministic rules
      |
      v
Save locally and render
```

In the MVP, model execution is in the side-panel application through a provider adapter. The MV3 service worker only routes messages; it does not call a model. The Accepted detector and toast do not trigger inference. A repeated open uses cached data and does not re-spend tokens or replay milestone animation.

## AI use by feature

| Feature or behavior | Is AI used? | Exact role |
| --- | --- | --- |
| F1: Code quality, readability, and concept scores | Yes | The model evaluates the submitted solution against the rubric and returns three scores, short reasons, and concrete evidence. |
| F2: Accepted toast | No | Deterministic page-state detection and UI only. It offers analysis; it does not analyze or read code until clicked. |
| F3: Score deltas | No, after analysis | Deltas and baselines are calculated from saved results using deterministic same-problem/pattern and rubric-version rules. The underlying scores being compared came from prior model analyses. |
| F4: Milestones and animation | No, after analysis | Application logic checks score changes, personal bests, counts, patterns, complexity changes, and review outcomes. CSS/UI displays an eligible milestone. |
| F5: Re-attempt scheduling | No | A fixed 1/3/7/21-day ladder, threshold checks, due dates, and step advancement are deterministic. |
| F5: Layered hints | Yes, when applicable | For low-score analyses, the model returns hints about repeated work, bottleneck, and a suitable data-structure type. Hints are bounded and must not contain code or numbered procedures. |
| F6: Suggested approach and concepts | Yes | The model proposes an approach, time/space complexity, and 1–3 concepts with short reasons and pattern tags. |
| F6: Current approach and complexity | Partly | The model estimates these. For Python, a local static check also detects limited signals; deterministic rules compare the estimate with those bounds and label agreement/disagreement. |
| Static Python analysis | No | Tree-sitter-based syntax analysis checks loop nesting, recursion, and sort/heap calls. It does not generate advice or use a model. |
| Cache, storage, export, delete-all | No | Local data operations use IndexedDB and `chrome.storage.local`. |
| Toast/event metrics and repeat-run variance | No | Local counters and arithmetic over stored analyses; no AI interpretation or telemetry service is required. |

## What the model receives

After the user has chosen Analyze, the model request is assembled from:

- The user's current solution code and programming language.
- The problem slug and title.
- Optional problem statement only if the user explicitly enables the off-by-default setting. The default request omits it.
- The rubric and version, fixed pattern taxonomy, and output schema.
- Python static signals when available; these are evidence for comparison, not a model substitute.

The model does **not** receive a LeetCode session credential, and the extension does not fetch bulk LeetCode history. The MVP's default design sends the solution only to the user's chosen provider; Gemini Nano can keep analysis on-device.

## What the model returns

The model is asked for structured output containing:

- Three 0–10 scores with reasons and evidence.
- The current and suggested approaches with time and space complexity classes.
- Suggested concepts, each with a reason and pattern tag.
- At most two concrete recommendations.
- Low-score hints in three short layers when triggered.

The model does not decide whether a toast appears, persist data, schedule a review, calculate score deltas, or control the extension. The application validates the response, enforces constraints, then stores and renders the accepted result.

## Deterministic guardrails around inference

1. **Explicit consent by action:** No analysis call occurs before the Analyze click.
2. **Cache first:** A hit keyed by solution hash, rubric version, and provider/model identity returns the existing result.
3. **Structured validation:** Reject malformed or out-of-contract output; retry invalid JSON once, then show an error.
4. **Score evidence:** A score of 9 or 10 needs at least two evidence items; otherwise clamp it to 8.
5. **Length and taxonomy limits:** Enforce reason, recommendation, hint, concept, pattern-tag, and complexity-enum constraints.
6. **Hint safety/content rules:** Reject hints containing code fences or numbered procedures and retry once.
7. **Complexity confidence:** Compare the model's Python complexity estimate to limited static signals when supported; show explicit confidence labels. Other languages remain LLM-only.
8. **No silent model swap:** Surface provider, permission, timeout, quota, and invalid-output errors rather than silently switching providers or models.

These controls improve predictability but do not guarantee that the model's reasoning or complexity estimate is correct. The UI should label model-claimed suggestions and avoid presenting estimates as proofs.

## AI use in the proposed production product

Production adds infrastructure, not autonomous behavior:

- **Managed mode:** An authenticated user submits a solution to an analysis job. A backend worker validates the request, calls a configured LLM provider, applies the same deterministic rules, stores the normalized result, and marks the job complete. The worker is an ordinary job processor; it does not independently choose goals or take user actions.
- **BYOK-direct mode:** The client calls the user's selected provider directly. If cloud history is enabled, it may sync the normalized result without source code or provider credentials.
- **Optional on-device mode:** Could continue to use Gemini Nano under the same bounded input/output contract.
- **Non-AI production services:** Authentication, quota enforcement, job status, history, reviews, deltas, exports, deletion, and sync are conventional application logic.

For managed mode, raw code should be transient and discarded after processing unless the user explicitly consents to retention. Do not put source code, prompts, provider keys, or raw provider responses in logs or analytics.

## What is not being used

- No autonomous AI agents or agent swarm.
- No AI-driven browsing or scraping of LeetCode.
- No AI execution of submitted code.
- No AI-generated UI, layout, animation, or toast decisions.
- No AI-based spaced-repetition scheduler or delta/milestone calculator.
- No background or scheduled AI analysis.
- No MCP server in the runtime architecture.
- No server-side analytics model or model training on user submissions in the specified MVP.

## Terminology

- **Model inference:** One request to a language model for a bounded analysis, returning a structured result.
- **Agent:** A system that can pursue goals through multi-step planning and actions, often invoking tools or continuing over time. The specified product does not use this.
- **Worker:** A browser service worker or backend queue worker that executes ordinary routing/job code. It is not an AI agent merely because it processes an AI request.
- **MCP:** A tool-connection protocol. It is not needed for this extension's direct provider API call or the optional on-device model.
