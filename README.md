# E-Leet-Help local MVP

A localhost adaptation of the product brief with a compact, Chrome-side-panel-style interface. It provides manual solution analysis, score and complexity comparisons, local history, review scheduling, layered hints, JSON export, and local data deletion.

The repository includes the local MVP app and the separate extension + API implementation described in [LEETCODE_ANALYZER_SPEC.md](./LEETCODE_ANALYZER_SPEC.md). The local web app does not read LeetCode pages directly.

## Recent updates

- Added a local-first analysis app with rating cards, complexity comparisons, concept tracking, and review scheduling.
- Added browser-side sample data and local storage persistence for analysis history and review queues.
- Updated the Flask service to validate requests, enforce installation/IP rate limits, and require a reviewed rubric before enabling analysis.
- Switched the analysis backend to Groq/OpenAI-compatible models with configurable timeout, token limits, and low-score enforcement.
- Added extension packaging/build steps and a safer server-side flow that only sends code after the user explicitly clicks Analyze.

## Local MVP app

The Node app runs on your machine at http://127.0.0.1:4173 and provides the UI for saving analyses locally and comparing them with prior attempts.

### Run the local app

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Add a model key and endpoint supported by your OpenAI-compatible provider:

   ```env
   HOST=127.0.0.1
   PORT=4173
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_API_KEY=your-key-here
   LLM_MODEL=gpt-4o-mini
   ```

   Groq example:

   ```env
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_API_KEY=your-groq-key
   LLM_MODEL=gpt-oss-20b
   ```

4. Start the app:

   ```bash
   npm start
   ```

5. Open http://127.0.0.1:4173.

The app can also load without a provider key so you can inspect the interface and sample analysis. Real analyses show a clear setup error until a key is configured. Restart the server after changing `.env`.

## LeetCode extension and Flask service

The extension reads only LeetCode submission/check responses to detect a newly Accepted submission. It does not read the user’s solution or contact the analysis server until the user clicks Analyze. When they do, it fetches the accepted code, sends it to the configured Flask service, and the server forwards it to the configured model provider.

### Start the Flask API locally

1. Use Python 3.9 or newer. From the repository root, create and activate a virtual environment.
2. Install the pinned server dependencies:

   ```powershell
   python -m pip install -r server\requirements.txt
   ```

3. Copy `server\.env.example` to `server\.env` and configure the provider settings. The server expects Groq by default:

   ```env
   GROQ_API_KEY=
   LLM_MODEL=llama-3.3-70b-versatile
   LLM_TIMEOUT_S=18
   LLM_MAX_TOKENS=2000
   LOW_SCORE_THRESHOLD=5
   RATE_PER_INSTALL=20 per hour;60 per day
   RATE_PER_IP=60 per hour
   RUBRIC_APPROVED=false
   ```

   Keep `RUBRIC_APPROVED=false` until you have reviewed the scoring anchors in `server/prompts.py`.

4. Start the Flask app from the repository root:

   ```powershell
   python -m flask --app server.app:app run --host 127.0.0.1 --port 5000
   ```

The service exposes these endpoints:

- `GET /healthz`
- `POST /api/v1/analyze`

Important server behavior:

- It has no persistent database and no CORS policy.
- It validates JSON payloads, install IDs, code size, and rubric version.
- It enforces per-install and per-IP rate limits.
- It expects one Gunicorn worker for the default in-memory limiter; use shared storage if you scale beyond one worker.
- Set `TRUST_PROXY=true` only when the service is behind a trusted reverse proxy.
- For production, run behind HTTPS with something like:

  ```bash
  gunicorn -w 1 -b 0.0.0.0:8000 server.app:app
  ```

### Build and load the extension

1. Install the extension dependencies and build the unpacked bundle:

   ```powershell
   Set-Location extension
   npm install
   npm run build
   ```

2. In Chrome, open `chrome://extensions`, enable Developer mode, then choose **Load unpacked** and select `extension\dist`.
3. The default development build targets http://127.0.0.1:5000. For deployment, set `FLASK_BASE_URL` to your HTTPS origin before building so the extension only calls that origin.

Common extension commands:

```powershell
npm run typecheck
npm test
```

## Local-first behavior and safety notes

- The server binds to `127.0.0.1` by default. Keep the development service local and do not expose it to the public internet.
- The browser sends code to `/api/analyze` only after the user submits the analysis form.
- Provider keys are read server-side and never stored in browser storage. Do not commit `.env` or `server/.env`.
- Analyses, review dates, settings, and events are stored in the browser’s `localStorage`.
- Code is omitted by default; enabling code retention affects future analyses.
- Cache keys use the solution hash, rubric version, and configured model so compatible results can be reused locally.
- This app has no LeetCode page reading, telemetry, account sync, notifications, or MCP integration. The separate extension and Flask service are responsible for the live analysis pipeline.

The extension’s live LeetCode GraphQL request still depends on undocumented site behavior. The `submissionDetails` query, 32-bit `Int!` variable, optional CSRF requirement, and `statusCode === 10` should be verified against an authenticated LeetCode browser session before relying on live analysis in production. This environment did not have browser access, so those checks and the end-to-end manual test plan remain outstanding.

## Commands

- `npm start` — start the local app.
- `npm run dev` — restart the app when server files change.
- `npm test` — run local HTTP smoke tests.
- `python -m pytest server\tests -q` — run the Flask API test suite.
