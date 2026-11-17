# MVP connectors and frontend stack

This is an implementation inventory for the [MVP spec](./LeetCode%20analysis%20companion%20MVP%20spec.md). It separates requirements stated by the spec from choices that still need to be made.

## Required connectors and integrations

| Integration | Purpose | MVP boundary |
| --- | --- | --- |
| LeetCode (`https://leetcode.com/*`) | Detect an Accepted submission, read the problem slug/title and, only after the user clicks Analyze, read the user's code from the page editor. | Read-only. No extra LeetCode requests, bulk history fetch, or stored problem statement. Selectors and text matchers should be centralized because the page DOM may change. |
| Chrome Extension APIs (Manifest V3) | Content scripts, message routing, local settings, and opening the side panel. | `storage`, `scripting`, `sidePanel`, plus the LeetCode host permission. Request a model provider's origin as an optional host permission only when the user enters that provider's key. Do not request `notifications`; do not use badges. |
| User-selected LLM provider (BYOK, default) | Analyze code and produce the structured scores, hints, concepts, and complexity comparison. | The provider is not finalized. The spec mentions Groq and `gpt-oss-120b` as an example, not a binding choice. Keep provider URL, model, key, and JSON-schema support configurable in the provider adapter. Send code only after explicit user action. |
| Browser `LanguageModel` / Gemini Nano (optional) | On-device analysis without a provider key or network request. | Optional fallback, not a required dependency. Show this option only when `LanguageModel.availability()` reports it available. Run from the extension page, not a Web Worker. |
| Tree-sitter Python parser | Static complexity signals for Python solutions (loop nesting, recursion, sort/heap calls). | Python only; bundle the parser/runtime with the extension. Other languages use the LLM-only confidence label. |

### MCPs

**No MCP server or MCP connector is required at runtime.** The product is a local Chrome extension and its only external analysis integration is the user's chosen LLM provider. GitHub sync and hosted services are out of scope. An MCP server could be used by developers during implementation, but it is not part of the MVP architecture or shipped product.

## Local data and privacy

- IndexedDB: analyses, review schedule, events, and repeat-run variance.
- `chrome.storage.local`: settings, including the provider key (plaintext in the MVP; disclose this in settings).
- Store a SHA-256 code hash by default; store source code only when the user enables “keep code.”
- Do not add a backend, telemetry service, cloud database, or sync connector.
- Send the problem slug and title by default, not the statement. Any optional statement-inclusion setting must be off by default and must not persist the statement.
- Provide JSON export and delete-all controls.

## Recommended minimal implementation stack

The spec defines the runtime architecture and browser storage, but does not mandate a framework or build tool. A small dependency footprint is preferred:

| Layer | Recommendation | Status / reason |
| --- | --- | --- |
| Language | TypeScript | Recommended. Helps keep the extension message contracts and LLM JSON output explicit. |
| Extension runtime | Chrome Manifest V3: content script, page-context code reader, thin service worker, side-panel page | Required by the spec. The worker routes messages only and holds no state. |
| UI | Preact + TypeScript | Recommended lightweight component layer for the side panel and toast. Share small presentational components where practical; keep page injection isolated. |
| Styling | Plain CSS, scoped to the side panel and closed Shadow DOM toast | Recommended. Avoid a CSS framework, component kit, or global page styles. |
| Build | Vite with a Manifest V3 extension integration/plugin | Recommended, not prescribed. Produces separate content-script, worker, and side-panel bundles. |
| Local database | Native IndexedDB | Required storage choice in the spec. Use a small wrapper only if the implementation genuinely benefits; no hosted database. |
| Settings | `chrome.storage.local` | Required by the spec. |
| Python static analysis | Tree-sitter with a Python grammar | Required for the planned Python-only static check; choose a browser-compatible/WASM package during implementation. |
| Validation | Runtime schema validation for LLM output (for example, Zod) | Recommended. Enforce lengths, enums, evidence requirements, and hint rules before saving/rendering. |

### Keep the frontend lean

- No full-size UI framework, component library, router, charting library, or animation package is needed.
- Use semantic HTML and CSS for the scores, comparison table, settings, and Due tab.
- Implement the milestone ring/count-up with a small CSS transition and `prefers-reduced-motion`; do not add confetti.
- Keep the panel readable at 360 px wide and fit the analysis view on one screen where possible.
- Use a closed Shadow DOM for the in-page toast so LeetCode styles do not leak in or out.

## Minimal UI surfaces

1. **Accepted toast:** bottom-right, non-modal, accessible status, Analyze/Dismiss/“don't show again,” 8-second auto-dismiss, pauses on hover. It must not trigger analysis until clicked.
2. **Analysis panel:** three score rows with brief reasons/evidence and at most two recommendations; Yours/Suggested comparison for approach, time, space, and concepts; explicit complexity-confidence labels.
3. **Re-attempt UI:** layered hints revealed only by click; a Due tab for due/overdue items. No push alert, notification, or badge.
4. **Settings:** provider/model and key, toast and animation preferences, low-score threshold, keep-code preference, optional statement setting, key-storage disclosure, JSON export, and delete-all.

## Explicitly out of scope

- Backend, account system, cross-device sync, GitHub sync, or cloud persistence.
- LeetCode history scraping or additional LeetCode API/network calls.
- Browser push notifications, Chrome notification API, action badges, or background reminders.
- Confetti, leaderboards, public streaks, points, or badges.
- MCP integrations in the shipped extension.

## Decisions to settle before implementation

- Which BYOK provider(s) and model(s) to support first, and their exact endpoints/origin permissions.
- Whether a click in the page can open `chrome.sidePanel` through the service worker; otherwise use the spec's in-page Shadow DOM drawer fallback.
- Which browser-compatible Tree-sitter package and grammar to bundle.
- The final build/plugin and schema-validation packages; neither is prescribed by the spec.
