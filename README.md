# Hiregram local MVP

A localhost adaptation of the product brief with a compact, Chrome-side-panel-style interface. It provides manual solution analysis, score and complexity comparisons, local history, review scheduling, layered hints, JSON export, and local data deletion.

The repository also includes the Manifest V3 LeetCode extension and stateless Flask/Anthropic analysis service specified in [LEETCODE_ANALYZER_SPEC.md](./LEETCODE_ANALYZER_SPEC.md). The existing local web MVP remains available independently; it does not connect to or read LeetCode pages.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Add a key and model supported by your OpenAI-compatible provider:

   ```env
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_API_KEY=your-key-here
   LLM_MODEL=gpt-4o-mini
   ```

   Groq example: set `LLM_BASE_URL=https://api.groq.com/openai/v1` and choose a model enabled for your Groq account.
4. Start the app with `npm start`.
5. Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

The app also starts without a key so you can inspect the interface and sample analysis. Real analyses show a clear setup error until a key is configured. Restart the server after changing `.env`.

## LeetCode extension and Flask service

The extension reads only LeetCode submission/check **responses** to detect a newly Accepted submission. It does not read the solution or contact the analysis server until you click **Analyze**. On that click, it fetches the accepted code, sends it to the configured Flask server, and the server forwards it to Anthropic. Source code is not saved by the extension or logged/stored by the Flask service.

### Start Flask locally

1. Use Python 3.9 or newer. From the repository root, create and activate a virtual environment.
2. Install the pinned server dependencies:

   ```powershell
   python -m pip install -r server\requirements.txt
   ```

3. Copy `server\.env.example` to `server\.env`, add `ANTHROPIC_API_KEY`, and keep `RUBRIC_APPROVED=false` until you have reviewed and approved the draft scoring anchors in `server\prompts.py`.
4. Start the server from the repository root:

   ```powershell
   python -m flask --app server.app:app run --host 127.0.0.1 --port 5000
   ```

The server exposes `GET /healthz` and `POST /api/v1/analyze`. It has no CORS policy or database. The default in-memory rate limiter requires one Gunicorn worker; use shared rate-limit storage if scaling beyond one worker. Set `TRUST_PROXY=true` only when the service is behind a trusted reverse proxy. For production, run `gunicorn -w 1 -b 0.0.0.0:8000 server.app:app` behind an HTTPS reverse proxy.

### Build and load the extension

1. Install the extension build dependencies and create the unpacked build:

   ```powershell
   Set-Location extension
   npm install
   npm run build
   ```

2. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `extension\dist`.
3. The default development build targets `http://127.0.0.1:5000`. For deployment, set `FLASK_BASE_URL` to your HTTPS server URL before building; the build embeds that URL and grants only its origin.

Commands: `npm run typecheck` and `npm test` from `extension`; `python -m pytest server\tests -q` from the repository root.

The extension's live LeetCode GraphQL request still depends on undocumented site behavior. The `submissionDetails` query, 32-bit `Int!` variable, optional CSRF requirement, and `statusCode === 10` should be verified against an authenticated LeetCode browser session before relying on live analysis. This environment did not have browser access, so those checks and the end-to-end manual test plan remain outstanding.

## Local-first behavior

- The server binds to `127.0.0.1` by default. Keep it local; do not expose this development server to a network.
- The browser sends code to `/api/analyze` only after you submit the Analyze form. The local server forwards it to the provider configured in `.env`.
- Provider keys are read by Node and never sent to or stored in browser storage. Do not commit `.env`.
- Analyses, review dates, settings, and events are stored in this browser's `localStorage`. Code is omitted by default; enabling code retention affects future analyses.
- Cache keys use the solution SHA-256, rubric version, and configured model. A compatible local result skips the provider request.
- This standalone web MVP has no LeetCode page reading, telemetry, account, sync, notifications, or MCP integration. The separate extension and Flask service are described below.

## Commands

- `npm start` — start the local server.
- `npm run dev` — restart the server when server files change.
- `npm test` — run local HTTP smoke tests.
