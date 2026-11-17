# LeetCode analysis companion: MVP spec

Nov 6, 2026 · @hh

## Scope and decisions

The MVP is a Chrome extension that, after an Accepted submission, shows a small toast; one click opens a side panel with three scores, a current-vs-suggested approach comparison, a delta against your last solve, and a re-attempt hint when a score is low. Everything runs locally; the only network call is your own LLM key.

**In scope (your six picks)**

1. F1: three scores out of 10 (code quality, readability, concept used)
2. F2: small post-solve toast
3. F3: score deltas vs your previous solve of the same problem or pattern
4. F4: milestone animation
5. F5: spaced re-attempt suggestion, shown only inside the panel when a score is low, with layered hints
6. F6: suggested concepts for the question, with your approach and the suggested one side by side on time and space complexity

**Out of scope (your cut list)**

Leaderboards and leagues, public streak counters, points and badges, push notifications, confetti by default, endowed-progress baselines, cross-platform support, a hosted backend, GitHub sync of analyses, and any bulk history fetch from LeetCode. Streaks of any kind are also out: LeetCode already owns that hook.

**Two decisions that bend the original principle**

The research recommended no pop-ups and a quiet animation. You picked a toast and a milestone animation, so both ship, constrained as follows.

- **Toast, not notification.** An in-page, non-modal card at the bottom-right of the LeetCode tab. It never takes focus, auto-dismisses after 8 seconds, runs no analysis until clicked, and has a "don't show again" control. It is not a browser push notification (`chrome.notifications` stays unused), which keeps it inside your cut list.
- **Animation on, confetti off.** A short count-up and ring on the score chip, fired only at milestones, skippable with a click, disabled by `prefers-reduced-motion` and by a setting. Confetti stays off by default, per your cut list.
- **Why the constraints:** the evidence for animation effects is thin (one Duolingo test, confounded with its milestone), and no source tests whether a toast hurts retention among people who liked LeetCode's no-pop-up design. The MVP logs toast dismissals so you can see that for yourself.

## User flow

You submit as usual. If the result is Accepted, a toast offers the analysis; nothing is read or sent until you click it. The only loop is the re-attempt, which returns you to a fresh Accepted result.

&#91;embedded content: user flow · 2 decisions, 1 loop\]

The toast is the only moment the extension speaks first. A dismissed toast stores a dismissal event and nothing else. Re-attempt dates appear in the panel and the Due tab, never as an alert.

## Feature specs

Six features, each with its behavior, its rules, and a done-when check. Rules marked (inference) are my design choices, not research findings, and are meant to be tuned.

### F1. Three scores

- **Behavior:** the panel shows code quality, readability and concept used, each an integer 0 to 10, with a one-line reason and two recommendations at most.
- **Rubric:** quality = structure, redundant work, edge-case handling. Readability = naming, nesting depth, function size. Concept = how well the chosen technique fits the problem. Anchors: 3 works but brute-force or tangled, 5 acceptable, 7 clean, 9 interview-grade.
- **Anti-inflation rule (inference):** every score carries an `evidence` array of concrete lines or constructs. A score of 9 or 10 needs two evidence items; without them it is clamped to 8.
- **Length:** each reason up to 140 characters, each recommendation up to 200 characters and naming a specific change. The panel must fit one screen without scrolling at 360 px wide.
- **Determinism:** temperature 0, results cached by code hash plus rubric version plus model, so re-opening never re-spends tokens.
- **Done when:** a valid JSON result renders in under 8 seconds at p50 on a BYOK backend, invalid JSON gets one retry then a readable error state, and a 9 never appears without evidence.

### F2. Post-solve toast

- **Behavior:** when the Accepted result appears, a card slides in at the bottom-right: "Accepted. Analyze this solution?" with Analyze and Dismiss, plus a "don't show again" link. If this code hash was already analyzed, it reads "Analyzed: 7 / 8 / 6" with an Open action.
- **Rules:** non-modal, `role="status"`, never takes focus, auto-dismisses after 8 seconds and pauses while hovered, appears once per accepted submission, no sound. Settings: on, snooze 24 hours, off.
- **Done when:** the toast shows within 1 second of the Accepted state, no analysis call is made before a click, and tabbing through the LeetCode page never lands on the toast unless the user moves focus to it.

### F3. Score deltas

- **Behavior:** next to each score, show the change against your previous analysis of the same problem. Also show a complexity change when the class moved, for example O(n²) to O(n).
- **Baseline order:** (1) your latest analysis of the same problem slug; (2) if none, the median of your last 5 analyses with the same primary pattern, needing at least 3; (3) otherwise the label "first solve in this pattern".
- **Noise guard (inference):** a change of 1 point renders as neutral "within noise" because LLM scoring varies between runs and the size of that variance is unmeasured. The MVP logs repeat-run variance so the threshold can be set from data.
- **Guards:** no delta across different rubric versions. Deltas are computed when read and never stored, so a rubric change cannot corrupt history.
- **Done when:** the same code analyzed twice shows no delta beyond noise, and a rubric-version change shows "no comparison" instead of a wrong number.

### F4. Milestone animation

- **Milestones:** first analysis; a personal best on any score; +2 or more on any score versus the same problem; complexity class improved; the 10th, 25th, 50th and 100th analyzed solve; first solve in a new pattern; a re-attempt that clears the low threshold.
- **Behavior:** a 600 ms count-up on the score chip with a ring pulse. At most one animation per analysis, skippable by click, and replaced by a static highlight under `prefers-reduced-motion`.
- **Setting:** Subtle (default) or Off. Confetti is not built in the MVP.
- **Done when:** a milestone fires at most once per analysis, never fires on a repeated cached open, and Off removes all motion.

### F5. Spaced re-attempt

- **Trigger:** any of the three scores at or below a low threshold, default 5 and adjustable.
- **Schedule (inference):** a fixed ladder of 1, 3, 7 and 21 days, not an adaptive algorithm. A re-attempt that analyzes with every score above the threshold moves up one step; otherwise it returns to 1 day.
- **Where it shows:** only inside the panel. The analysis view shows "Re-attempt on Nov 9", and a Due tab lists items due or overdue, each linking to the problem page when you click it. No icon badge, no `chrome.notifications`, no background alerts.
- **Hints (low-score items only):** three layers, each revealed by a click. Layer 1 names the repeated work, for example "the inner loop re-scans the array on every pass". Layer 2 names the bottleneck worth optimizing. Layer 3 names the type of data structure that fits. Never code, never steps: the how is left to you.
- **Hint rules:** each layer up to 100 characters, stored under `hints` as `repeatedWork`, `bottleneck` and `structure`. Output containing a code fence or a numbered procedure is rejected and retried once. Hints show on the analysis view and, collapsed, on the Due tab before you re-solve. On Python, the static check can corroborate layer 1 by finding nested loops over the same iterable (inference).
- **Done when:** the manifest requests neither the `notifications` permission nor a badge call, and a due item appears in the Due tab without any push, ten test problems produce no hint containing code or steps, and every hint reveal is logged.

### F6. Suggested concepts and side-by-side complexity

- **Behavior:** a two-column table, Yours and Suggested, with rows for approach, time, space and concepts. Cells that differ are highlighted. When your solution already matches the best known approach, the panel says so and shows only concept notes. On low-score items the Suggested column starts collapsed behind a reveal, and the F5 hints show first.
- **Output shape:** one to three suggested concepts, each with a reason up to 100 characters and a pattern tag; one "current" block and one "suggested" block, each with approach name, time and space.
- **Confidence label on your complexity:** "Static and LLM agree", "LLM only", or "Disagree, check this". The suggested approach's complexity is always labelled "LLM-claimed".
- **Static check (inference, Python only):** a bundled tree-sitter parser measures loop nesting depth, recursion and sort or heap calls. Nesting depth d gives an upper bound of n^d. A sort call gives a lower bound of n log n. Recursion gives no verdict. Agree means the LLM class falls inside the bounds, disagree means it falls outside, and every other language or any recursion is "LLM only".
- **Why the label matters:** the best time-complexity accuracy in BigO(Bench) was 41.4%, space accuracy was far lower, and models tend to default to the optimal class.
- **Done when:** a nested-loop solution that the model labels O(n) shows "Disagree", and the suggested column never appears without its "LLM-claimed" tag.

## Data model

All data lives in the browser, in IndexedDB plus `chrome.storage.local` for settings. Nothing leaves the device except the code sent to the LLM you chose, and the extension stores a code hash instead of the code unless you opt in.

| Store | Key | Holds |
| --- | --- | --- |
| `analyses` | `id` (uuid), indexed by `problemSlug`, `primaryPattern`, `createdAt` | `problemSlug`, `title`, `language`, `codeHash` (SHA-256), `code` (only if "keep code" is on), `rubricVersion`, `model`, `backend`, `scores` (three objects of value, reason, evidence), `complexity` (current and suggested, each with time, space, label, static hint), `concepts`, `primaryPattern`, `recommendations`, hints (repeated work, bottleneck, structure), `latencyMs`, `tokensIn`, `tokensOut`, `createdAt` |
| `reviews` | `problemSlug` | `step` (0 to 3), `dueAt`, `lowestScore`, `sourceAnalysisId`, `status` (due, done, snoozed) |
| `events` | auto id | `ts`, `type` (toast shown, clicked, dismissed, auto-dismissed, panel open, milestone shown, milestone skipped, hint revealed), `analysisId` |
| `variance` | `codeHash` | repeat-run scores for the same code, model and rubric, used to set the noise threshold in F3 |
| settings | one object | toast mode, animation mode, low threshold, keep code, backend, model, API key |

**Derived, never stored:** score deltas, the Due list, milestone eligibility. They are recomputed from `analyses` and `reviews` on read, so changing a rule never rewrites history.

**Pattern tags (inference).** The model must pick `primaryPattern` from a fixed list, so "same pattern" in F3 is a lookup and not a fuzzy match: two pointers, sliding window, hash map, prefix sum, binary search, stack, monotonic stack, heap, BFS, DFS, backtracking, 1D DP, 2D DP, greedy, intervals, union-find, trie, shortest path, topological sort, bit manipulation, math, sorting, linked list, tree traversal, matrix, design. Anything else maps to "other".

**Size.** A record without code is on the order of a few kilobytes (my estimate), so thousands of analyses fit comfortably. Provide JSON export and a delete-all button in settings from day one.

**API key.** Stored in `chrome.storage.local` in plaintext unless you add a passphrase, which is out of MVP scope. Say so in the settings screen.

## Architecture and analysis pipeline

Four parts do the work: a detector and a code reader inside the LeetCode tab, a thin service worker, and a side panel page where the whole analysis pipeline runs. Only the code goes out, to the LLM you pick.

&#91;embedded content: architecture · 4 parts, 1 external call\]

A click on the toast sends the code from the page to the side panel, which runs the static check, calls the LLM, applies the rules, saves the result and draws it. The highlighted box is the only place your code leaves the device.

**Components**

- **Detector:** a content script with a scoped, debounced `MutationObserver` on the submission result area, re-armed on single-page navigation. It matches the Accepted state by text and ARIA label, with every matcher in one config object so a LeetCode UI change is a one-file fix.
- **Toast UI:** a closed Shadow DOM host on `document.body`, with a fixed-position fallback if the host is removed by a re-render.
- **Code reader:** injected into the page's own context on click only, because content scripts cannot see `window.monaco`. It reads `window.monaco.editor.getModels()[0].getValue()` and falls back to the editor's rendered text. Both are unverified against the live page.
- **Service worker:** routes messages and nothing else. A Manifest V3 worker stops when idle, so it holds no state and makes no model calls.
- **Side panel page:** runs the static check, the LLM client and the rules. It also hosts the Gemini Nano call, which is unavailable in Web Workers.

**Pipeline per analysis**

1. Hash the code (SHA-256) and look it up with the rubric version and model. A hit renders the stored result and stops.
2. Static check on Python: loop nesting depth, recursion, sort and heap calls, giving an upper and lower bound.
3. Build the prompt from the problem slug and title, the language, the code, the static bounds, the rubric and the pattern list.
4. Call the model at temperature 0 with JSON-schema output. One retry on invalid JSON, then a readable error.
5. Apply the rules: clamp unsupported 9s and 10s to 8, set the complexity label, force the pattern into the fixed list, check the low-score trigger, reject hints that contain code or steps.
6. Save the analysis, create or advance a review item if a score is low, then compute deltas and milestones on read and render.

**Output schema**

```json
{
  "problemSlug": "string",
  "primaryPattern": "one of the fixed pattern tags, or other",
  "scores": {
    "quality":     { "value": 0, "reason": "up to 140 chars", "evidence": ["lines or constructs"] },
    "readability": { "value": 0, "reason": "up to 140 chars", "evidence": ["..."] },
    "concept":     { "value": 0, "reason": "up to 140 chars", "evidence": ["..."] }
  },
  "complexity": {
    "current":   { "approach": "string", "time": "class", "space": "class" },
    "suggested": { "approach": "string", "time": "class", "space": "class" }
  },
  "concepts": [{ "name": "string", "why": "up to 100 chars", "patternTag": "tag" }],
  "recommendations": [{ "text": "up to 200 chars" }],
  "hints": { "repeatedWork": "up to 100 chars", "bottleneck": "up to 100 chars", "structure": "a data structure type, no steps" }
}
```

The complexity `class` is an enum: O(1), O(log n), O(n), O(n log n), O(n^2), O(n^3), O(2^n), O(n!), other. An enum lets the static bounds compare against the model's answer directly.

**Backend**

|  | Bring your own key (default) | Gemini Nano (optional) |
| --- | --- | --- |
| Quality | strong models; a published extension already runs `gpt-oss-120b` through Groq | on-device model; no code-reasoning benchmark found, so expect weaker complexity reasoning (inference) |
| Setup | paste a key once, grant that provider's origin as an optional permission | none, but needs more than 4 GB VRAM, 16 GB RAM and 22 GB free disk |
| Privacy | code goes to your chosen provider | fully local |
| Cost | on you; roughly 1.5k to 2.5k tokens per analysis (my estimate, prices unchecked) | free |

Gate Nano on `LanguageModel.availability()` and hide the option when it reports unavailable.

**Permissions and decisions**

- **Permissions:** host access to `https://leetcode.com/*`, plus `storage`, `scripting` and `sidePanel`. The LLM provider origin is an optional permission requested when you enter the key. No `notifications`, no `history`, no `tabs` beyond what messaging needs.
- **Problem text:** the MVP sends the slug and title, not the statement, and expects the model to recognise well-known problems. A newer or obscure problem may get a weaker suggested approach. An off-by-default toggle can include the statement from the page at click time, never stored.
- **Open item:** `chrome.sidePanel.open` needs a user gesture, and it is unconfirmed that a click inside the page carries that gesture through the service worker. If it does not, fall back to an in-page Shadow DOM drawer for the panel UI.

## Build plan

One developer can ship this in roughly four weeks. That figure is my estimate, not a measured one.

&#91;embedded content: build plan · 4 weeks, 4 gates\]

Diamonds mark the gate to pass before starting the next week. Week one proves you can read the code and show the toast. Week two proves the analysis is valid and fast enough. Week three proves history works. Week four adds the animation and the local log that tests the retention premise.

**Definition of done**

- [ ] All six features pass their done-when checks in the feature specs
- [ ] The manifest has no `notifications` permission, no badge call, and no request to LeetCode beyond the page's own
- [ ] Ten real solves across at least three patterns are analyzed, and deltas and the Due tab behave on them
- [ ] JSON export and delete-all work from the settings screen
- [ ] The settings screen says the API key is stored unencrypted
- [ ] The store listing's single purpose reads: analyze the user's own accepted solutions on request and store results locally
- [ ] The privacy policy states that code goes only to the provider you chose, and that nothing is kept on a server

## Metrics, risks and pre-build checks

The MVP's real job is to test one untested premise: that an opt-in, low-pressure design retains users as well as a pushier one. Every metric below comes from the local `events` and `analyses` stores, so no server is needed.

| Metric | How it is measured | What it tells you |
| --- | --- | --- |
| Toast click-through | analyses opened from the toast / toasts shown | whether the toast helps or annoys |
| Toast dismissal | manual dismiss or "don't show again" / toasts shown | the cost of your pop-up decision |
| Active days per week | distinct days with at least one analysis | the habit signal, with no streak shown |
| Re-attempt completion | re-attempts done / items due | whether F5 is used |
| Mean score per dimension | average over the last 30 analyses | inflation: tighten the rubric if it drifts high |
| Repeat-run spread | standard deviation per score on identical code | the right noise threshold for F3 |
| "Disagree" share | disagree labels / analyses | a rough accuracy signal for complexity |
| Latency and tokens | p50 and p95, tokens in and out | speed and cost per analysis |

Set your own thresholds after two weeks of use. A reasonable first pass is to revisit the toast if fewer than one in five open the analysis after 50 showings, and to tighten the rubric if any mean sits above 7.5 after 30 analyses. Both numbers are placeholders, not findings.

**Risks**

| Risk | Mitigation |
| --- | --- |
| LeetCode terms not yet read | read them before building; stay read-only, act on click, send no extra requests to LeetCode, store no problem text |
| Complexity accuracy | static check plus LLM, a visible label, "LLM-claimed" on the suggested approach, static check on Python only |
| Score inflation | evidence clamp at 8, mean tracked per dimension |
| Score noise breaking deltas | "within noise" rule at 1 point, repeat-run log |
| API cost and BYOK friction | cache by hash, show estimated cost per analysis in settings, Gemini Nano as an optional private mode |
| DOM breakage | selectors and text matchers in one config object; LeetHub 2.0 shows 197 open issues, so budget ongoing fixes |
| Toast erodes the quiet feel you like | dismiss controls, event log, one switch that turns it off |
| Overlap with LeetCode's native feature | the value is history, deltas, side-by-side concepts and re-attempts, not the one-shot score |

**Verify before building**

- [ ] Read leetcode.com/terms and /privacy for automation, third-party tool and content-license clauses
- [ ] In DevTools, confirm `window.monaco` is reachable from the page's own context and that `getModels()[0].getValue()` returns the submitted code
- [ ] Capture the Accepted panel's DOM and ARIA text, and fix the exact text your detector will match
- [ ] Capture the submit and check network calls and GraphQL operation names; the names in the research notes are guesses
- [ ] Check whether LeetCode's native Analyze output appears in the DOM or network, and decide whether reading it is out of bounds
- [ ] Read the Chrome Web Store program policies and the Manifest V3 service-worker lifecycle page
- [ ] Confirm `LanguageModel` is callable from your extension page and that your hardware meets the requirements
- [ ] Check current prices for the model you choose
- [ ] Search Reddit and X directly for reactions to the native feature and for free-tier limits
