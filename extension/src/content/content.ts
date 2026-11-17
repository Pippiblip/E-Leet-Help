import {
  MAX_CODE_CHARS,
  MESSAGE_ANALYZE,
  PAGE_MESSAGE_SOURCE,
  PAGE_MESSAGE_VERSION,
} from "../shared/constants";
import type {
  AcceptedPayload,
  AnalyzeBody,
  RuntimeAnalyzeMessage,
  RuntimeAnalyzeResponse,
  StoredResult,
  Verdict,
} from "../shared/types";
import { getSubmissionDetails, LeetCodeApiError } from "./leetcode-api";
import {
  addSeenId,
  deleteAllData,
  getCachedResult,
  getResults,
  getReviews,
  getSettings,
  getAllStoredResults,
  hasSeenId,
  saveResult,
  saveSettings,
  updateReview,
  type ReviewItem,
  type UserSettings,
} from "./storage";
import { AnalyzerUi, type PanelView, type UiActions } from "./ui";

const ui = new AnalyzerUi();
const handled = new Set<string>();
const busyIds = new Set<string>();
let currentPayload: AcceptedPayload | null = null;
let currentResult: StoredResult | null = null;
let currentCached = false;
let currentError: string | null = null;
let activeTab: PanelView["activeTab"] = "result";
let panelVisible = false;

function validateAccepted(value: unknown): AcceptedPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.submission_id !== "string" || !/^\d{1,32}$/.test(payload.submission_id)
    || typeof payload.slug !== "string" || !/^[a-z0-9-]{1,120}$/i.test(payload.slug)
    || payload.status_code !== 10) return null;
  const stringFields = ["status_msg", "lang", "pretty_lang", "status_runtime", "status_memory"];
  const numericFields = ["runtime_percentile", "memory_percentile", "total_correct", "total_testcases"];
  if (stringFields.some((key) => payload[key] !== undefined
    && (typeof payload[key] !== "string" || payload[key].length > 160))
    || numericFields.some((key) => payload[key] !== undefined
      && (typeof payload[key] !== "number" || !Number.isFinite(payload[key])))) return null;
  if (payload.question_id !== undefined
    && typeof payload.question_id !== "string" && typeof payload.question_id !== "number") return null;

  const clean: AcceptedPayload = {
    submission_id: payload.submission_id,
    slug: payload.slug.toLowerCase(),
    status_code: 10,
  };
  for (const key of [...stringFields, ...numericFields, "question_id"] as const) {
    const field = payload[key];
    if (typeof field === "string" || typeof field === "number") Object.assign(clean, { [key]: field });
  }
  return clean;
}

function getVerdict(payload: AcceptedPayload): Verdict {
  const verdict: Verdict = { status_code: 10 };
  for (const key of [
    "status_msg", "status_runtime", "status_memory", "runtime_percentile", "memory_percentile",
    "total_correct", "total_testcases",
  ] as const) {
    const value = payload[key];
    if (typeof value === "string" || typeof value === "number") Object.assign(verdict, { [key]: value });
  }
  return verdict;
}

function priorResult(results: StoredResult[], result: StoredResult | null): StoredResult | null {
  if (!result) return results.filter((item) => item.rubric_version === "v1").at(-1) || null;
  const index = results.findIndex((item) => item.submission_id === result.submission_id);
  if (index < 0) return null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (results[cursor].rubric_version === result.rubric_version) return results[cursor];
  }
  return null;
}

async function panelView(): Promise<PanelView> {
  const payload = currentPayload;
  const slug = payload?.slug || currentResult?.slug || "";
  const [results, reviews, settings] = await Promise.all([
    slug ? getResults(slug) : Promise.resolve([]),
    getReviews(),
    getSettings(),
  ]);
  const result = currentResult || (!payload && results.length ? results[results.length - 1] : null);
  return {
    title: result?.title || payload?.slug || "LeetCode Analyzer",
    subtitle: result ? `${result.lang} · ${result.difficulty}` : "Accepted solution analyzer",
    activeTab,
    result,
    previous: priorResult(results, result),
    results,
    reviews: reviews.sort((a, b) => a.due_at - b.due_at),
    settings,
    busy: Boolean(payload && busyIds.has(payload.submission_id)),
    error: currentError,
    canAnalyze: Boolean(payload),
    cached: currentCached,
  };
}

async function redraw(actions: UiActions): Promise<void> {
  panelVisible = true;
  ui.showPanel(await panelView(), actions);
}

const actions: UiActions = {
  analyze: () => { void runAnalysis(); },
  retry: () => { void runAnalysis(); },
  cancel: () => {
    panelVisible = false;
    ui.showPanelClose();
  },
  dismiss: () => {
    panelVisible = false;
    ui.clearToast();
    ui.showPanelClose();
  },
  snooze: () => {
    void getSettings().then(async (settings) => {
      await saveSettings({ ...settings, toastMode: "snoozed", snoozedUntil: Date.now() + 86_400_000 });
      ui.clearToast();
    });
  },
  disableToast: () => {
    void getSettings().then(async (settings) => {
      await saveSettings({ ...settings, toastMode: "off", snoozedUntil: null });
      ui.clearToast();
    });
  },
  setTab: (tab) => {
    activeTab = tab;
    void redraw(actions);
  },
  openProblem: (slug) => {
    if (/^[a-z0-9-]+$/i.test(slug)) window.open(`https://leetcode.com/problems/${slug}/`, "_blank", "noopener");
  },
  selectResult: (result) => {
    currentResult = result;
    currentPayload = null;
    currentCached = true;
    currentError = null;
    activeTab = "result";
    void redraw(actions);
  },
  exportData: () => { void exportData(); },
  deleteAll: () => {
    void deleteAllData().then(() => {
      currentResult = null;
      currentError = null;
      void redraw(actions);
    }).catch(() => {
      currentError = "Could not delete local data.";
      void redraw(actions);
    });
  },
  updateSettings: (settings) => {
    void saveSettings(settings).then(() => redraw(actions)).catch(() => {
      currentError = "Could not save settings.";
      void redraw(actions);
    });
  },
};

async function exportData(): Promise<void> {
  try {
    const [results, reviews, settings] = await Promise.all([getAllStoredResults(), getReviews(), getSettings()]);
    const blob = new Blob([JSON.stringify({ results, reviews, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leetcode-analysis-export.json";
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    currentError = "Could not export local data.";
    await redraw(actions);
  }
}

async function showAccepted(payload: AcceptedPayload): Promise<void> {
  const [settings, cached] = await Promise.all([
    getSettings(),
    getCachedResult(payload.slug, payload.submission_id),
  ]);
  if (settings.toastMode === "off"
    || (settings.toastMode === "snoozed" && settings.snoozedUntil !== null && settings.snoozedUntil > Date.now())) return;
  currentPayload = payload;
  currentResult = cached;
  currentCached = Boolean(cached);
  currentError = null;
  activeTab = "result";
  if (cached) {
    ui.showToast(`Analyzed ${cached.scores.quality} · ${cached.scores.readability} · ${cached.scores.concept}`, "Open", {
      activate: () => {
        ui.clearToast();
        currentPayload = payload;
        currentResult = cached;
        currentCached = true;
        currentError = null;
        activeTab = "result";
        void redraw(actions);
      },
      dismiss: () => ui.clearToast(),
      snooze: actions.snooze,
      disable: actions.disableToast,
    });
    return;
  }
  ui.showToast("Accepted — Analyze?", "Analyze", {
    activate: () => {
      ui.clearToast();
      currentPayload = payload;
      currentResult = null;
      currentCached = false;
      currentError = null;
      activeTab = "result";
      void runAnalysis(payload);
    },
    dismiss: () => ui.clearToast(),
    snooze: actions.snooze,
    disable: actions.disableToast,
  });
}

async function handleAccepted(message: MessageEvent): Promise<void> {
  if (message.source !== window || message.origin !== location.origin) return;
  const envelope = message.data;
  if (!envelope || typeof envelope !== "object"
    || envelope.source !== PAGE_MESSAGE_SOURCE
    || envelope.v !== PAGE_MESSAGE_VERSION
    || envelope.type !== "ACCEPTED") return;
  const payload = validateAccepted(envelope.payload);
  if (!payload || handled.has(payload.submission_id)) return;
  handled.add(payload.submission_id);
  const cached = await getCachedResult(payload.slug, payload.submission_id);
  if (!cached && await hasSeenId(payload.submission_id)) return;
  await addSeenId(payload.submission_id);
  await showAccepted(payload);
}

async function runAnalysis(accepted: AcceptedPayload | null = currentPayload): Promise<void> {
  const payload = accepted;
  if (!payload || busyIds.has(payload.submission_id)) return;
  busyIds.add(payload.submission_id);
  if (currentPayload?.submission_id !== payload.submission_id) {
    currentPayload = payload;
    currentResult = null;
    currentCached = false;
  }
  currentError = null;
  activeTab = "result";
  await redraw(actions);
  try {
    const details = await getSubmissionDetails(payload.submission_id);
    if (details.statusCode !== undefined && details.statusCode !== 10) {
      throw new LeetCodeApiError("The submission is no longer Accepted.", "NOT_ACCEPTED");
    }
    if (!details.code.trim() || details.code.length > MAX_CODE_CHARS) {
      throw new Error(`The accepted solution must be between 1 and ${MAX_CODE_CHARS} characters.`);
    }
    const slug = details.titleSlug;
    const results = await getResults(slug);
    const history = results.slice(-3).map((result) => ({
      submission_id: result.submission_id,
      scores: result.scores,
      time_complexity: result.complexity.time,
      space_complexity: result.complexity.space,
      rubric_version: result.rubric_version,
    }));
    const verdict: AnalyzeBody["verdict"] = {};
    for (const key of [
      "status_runtime", "status_memory", "runtime_percentile", "memory_percentile",
      "total_correct", "total_testcases",
    ] as const) {
      const value = payload[key];
      if (typeof value === "string" || typeof value === "number") Object.assign(verdict, { [key]: value });
    }
    const body: AnalyzeBody = {
      submission_id: payload.submission_id,
      slug,
      title: details.title,
      difficulty: details.difficulty,
      topic_tags: details.tags,
      lang: details.lang,
      code: details.code,
      verdict,
      history,
    };
    const response = await chrome.runtime.sendMessage<RuntimeAnalyzeMessage, RuntimeAnalyzeResponse>({
      type: MESSAGE_ANALYZE,
      body,
    });
    if (!response || !response.ok) {
      throw new Error(response?.error.message || "The analysis request failed.");
    }
    const stored = await saveResult(
      slug,
      payload.submission_id,
      response.data,
      getVerdict(payload),
      { title: details.title, lang: details.langVerbose, difficulty: details.difficulty },
    );
    const settings = await getSettings();
    await updateReview(slug, details.title, stored, settings.threshold);
    if (currentPayload?.submission_id === payload.submission_id) {
      currentPayload = { ...payload, slug };
      currentResult = stored;
      currentCached = false;
      currentError = null;
    }
  } catch (error) {
    if (currentPayload?.submission_id === payload.submission_id) {
      currentError = error instanceof Error ? error.message : "Analysis failed. Please retry.";
    }
  } finally {
    busyIds.delete(payload.submission_id);
    if (panelVisible && currentPayload?.submission_id === payload.submission_id) await redraw(actions);
  }
}

window.addEventListener("message", (event) => {
  void handleAccepted(event).catch(() => {
    currentError = "The accepted submission could not be opened.";
    void redraw(actions);
  });
});
