const STORAGE_KEY = "hiregram.local.mvp.v1";
const RUBRIC_VERSION = "2026-11";
const REVIEW_LADDER = [1, 3, 7, 21];
const labels = {
  quality: "Quality",
  readability: "Readability",
  concept: "Concept",
};
const pageNames = {
  result: "Result",
  analyze: "New analysis",
  reviews: "Review queue",
  history: "Analysis history",
  settings: "Settings",
};
function makeSample() {
  const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  return {
    id: "sample-two-sum",
    schemaVersion: "1.0",
    problemSlug: "two-sum",
    title: "Two Sum",
    language: "Python",
    codeHash: "sample-preview-hash",
    codeRetention: "hash_only",
    primaryPattern: "hash map",
    scores: {
      quality: { value: 5, reason: "The nested scan repeats work as the input grows.", evidence: ["Every candidate pair is checked in a nested loop."] },
      readability: { value: 7, reason: "The two loop bounds make the pair search easy to trace.", evidence: ["The inner loop starts after the current index."] },
      concept: { value: 5, reason: "A direct scan works, but does not reuse previously seen values.", evidence: ["The solution uses no lookup structure."] },
    },
    complexity: {
      current: { approach: "Nested pair scan", time: "O(n^2)", space: "O(1)", confidence: "llm_only" },
      suggested: { approach: "Single-pass hash map", time: "O(n)", space: "O(n)", confidence: "llm_claimed" },
    },
    concepts: [
      { name: "Complement lookup", why: "Find the needed partner without scanning the list again.", patternTag: "hash map" },
      { name: "One-pass traversal", why: "Build the lookup as the input is traversed.", patternTag: "hash map" },
    ],
    recommendations: [{ text: "Document that the solution assumes exactly one valid pair, as guaranteed by the prompt." }],
    hints: {
      repeatedWork: "The inner loop revisits remaining values for each new starting index.",
      bottleneck: "Repeated pair checks dominate the runtime as the input grows.",
      structure: "A hash map can remember values already visited.",
    },
    model: { provider: "Sample preview", name: "Example result" },
    rubricVersion: RUBRIC_VERSION,
    createdAt,
    demo: true,
  };
}

function makeInitialState() {
  const analysis = makeSample();
  return {
    initialized: true,
    analyses: [analysis],
    reviews: [{
      id: "sample-review-two-sum",
      problemSlug: analysis.problemSlug,
      title: analysis.title,
      step: 0,
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      lowestScore: 5,
      sourceAnalysisId: analysis.id,
      status: "due",
      demo: true,
    }],
    events: [{ ts: analysis.createdAt, type: "sample_preview_created", analysisId: analysis.id }],
    settings: { threshold: 5, keepCode: false, animations: true },
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return makeInitialState();
    const value = JSON.parse(stored);
    if (!value || !Array.isArray(value.analyses) || !Array.isArray(value.reviews) || !value.settings) {
      throw new Error("Stored app data did not match the expected format.");
    }
    return {
      initialized: true,
      analyses: value.analyses,
      reviews: value.reviews,
      events: Array.isArray(value.events) ? value.events : [],
      settings: { threshold: 5, keepCode: false, animations: true, ...value.settings },
    };
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    queueMicrotask(() => showToast(`Local data could not be read and was reset: ${error.message}`));
    return makeInitialState();
  }
}

const state = loadState();
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let currentView = "result";
let providerInfo = { model: "Not configured", providerConfigured: false };
let toastTimer;
let justAnalyzedId = null;
let milestoneByAnalysis = {};
let activeAnalysisId = latestAnalyses()[0]?.id || null;
let revealedHints = {};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateReviewCount();
  } catch (error) {
    showToast(`Could not save local data: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function updateReviewCount() {
  const count = state.reviews.filter((review) => review.status === "due" || review.status === "scheduled")
    .filter((review) => new Date(review.dueAt) <= new Date()).length;
  const badge = document.querySelector("#review-count");
  if (badge) badge.textContent = String(count);
}

function addEvent(type, analysisId = null) {
  state.events.unshift({ ts: new Date().toISOString(), type, analysisId });
  state.events = state.events.slice(0, 500);
}

function dateLabel(date, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(date));
}

function ago(date) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function activeReviews() {
  return state.reviews.filter((review) => review.status === "due" || review.status === "scheduled")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

function latestAnalyses() {
  return [...state.analyses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function progressFor(analysis) {
  const compatible = latestAnalyses().filter((item) =>
    item.id !== analysis.id && !item.demo && item.rubricVersion === analysis.rubricVersion);
  let baseline = compatible.find((item) => item.problemSlug === analysis.problemSlug);
  let baselineKind = "same problem";
  if (!baseline) {
    const patternSet = compatible.filter((item) => item.primaryPattern === analysis.primaryPattern).slice(0, 5);
    if (patternSet.length >= 3) {
      const median = (key) => {
        const sorted = patternSet.map((item) => item.scores[key].value).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      };
      return { kind: "pattern median", scores: Object.fromEntries(Object.keys(labels).map((key) => [key, median(key)])), analysis: null };
    }
    return null;
  }
  return { kind: baselineKind, scores: Object.fromEntries(Object.keys(labels).map((key) => [key, baseline.scores[key].value])), analysis: baseline };
}

function scoreDelta(analysis, name) {
  const progress = progressFor(analysis);
  if (!progress) return { text: "—", className: "neutral" };
  const difference = analysis.scores[name].value - progress.scores[name];
  if (Math.abs(difference) <= 1) return { text: "within noise", className: "neutral" };
  return { text: `${difference > 0 ? "+" : ""}${difference}`, className: difference > 0 ? "" : "down" };
}

function milestoneFor(analysis, previousReview = null) {
  const previous = latestAnalyses().filter((item) =>
    item.id !== analysis.id && !item.demo && item.problemSlug === analysis.problemSlug && item.rubricVersion === analysis.rubricVersion)[0];
  const older = latestAnalyses().filter((item) => item.id !== analysis.id && !item.demo);
  if (!previous && older.length === 0) return "First analysis — a strong start.";
  if (previousReview && Object.values(analysis.scores).every((score) => score.value > state.settings.threshold)) {
    return "Re-attempt cleared your low-score threshold.";
  }
  if (previous) {
    for (const name of Object.keys(labels)) {
      if (analysis.scores[name].value - previous.scores[name].value >= 2) return `${labels[name]} improved by 2+ points.`;
    }
    if (!older.some((item) => item.primaryPattern === analysis.primaryPattern)) {
      return `First solve in the ${analysis.primaryPattern} pattern.`;
    }
    if (previous.complexity.current.time !== analysis.complexity.current.time
      && complexityRank(analysis.complexity.current.time) < complexityRank(previous.complexity.current.time)) {
      return "Your time complexity improved.";
    }
  }
  const best = Object.keys(labels).some((name) =>
    analysis.scores[name].value > Math.max(0, ...older.map((item) => item.scores[name].value)));
  if (best) return "A new personal best score.";
  const count = older.length + 1;
  if ([10, 25, 50, 100].includes(count)) return `${count} solutions analyzed — keep it thoughtful.`;
  return null;
}

function complexityRank(value) {
  return ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)", "other"].indexOf(value);
}

function scorePills(analysis) {
  return Object.keys(labels).map((key) =>
    `<span class="score-pill">${labels[key].split(" ")[0]} <strong>${analysis.scores[key].value}</strong></span>`).join("");
}

function renderRecentRow(analysis) {
  return `<div class="recent-entry" role="button" tabindex="0" data-action="open-analysis" data-id="${escapeHtml(analysis.id)}">
    <div class="problem-meta"><div class="problem-title"><span>${escapeHtml(analysis.title)}</span>${analysis.demo ? '<span class="pill sample">Preview</span>' : ""}</div><small>${escapeHtml(analysis.language)} · ${ago(analysis.createdAt)}</small></div>
    <div class="score-pills">${scorePills(analysis)}</div>
    <div class="complexity-cell"><strong>${escapeHtml(analysis.complexity.current.time)} time</strong>${escapeHtml(analysis.primaryPattern)}</div>
    <button class="row-action" aria-label="Open ${escapeHtml(analysis.title)} analysis">›</button>
  </div>`;
}

function renderResult() {
  const analysis = state.analyses.find((item) => item.id === activeAnalysisId);
  if (!analysis) {
    app.innerHTML = `<section class="empty-state"><strong>No analysis yet</strong><p>Paste a solution you have already submitted to review its scores, complexity, and concepts.</p><button class="button button-primary" data-nav="analyze">Analyze a solution</button></section>`;
    return;
  }

  const baseline = progressFor(analysis);
  const review = activeReviews().find((item) => item.problemSlug === analysis.problemSlug);
  const lowScore = Object.values(analysis.scores).some((score) => score.value <= state.settings.threshold);
  const milestone = justAnalyzedId === analysis.id ? milestoneByAnalysis[analysis.id] : null;
  const scoreCards = Object.keys(labels).map((key) => {
    const score = analysis.scores[key];
    const delta = scoreDelta(analysis, key);
    const previous = baseline?.scores[key];
    return `<article class="score-card" aria-label="${labels[key]}, ${score.value} out of 10${baseline ? `, ${delta.text} versus last` : ""}">
      <div class="score-summary">
        <div class="score-top"><span>${labels[key]}</span></div>
        <div class="score-value">${score.value}<small>/10</small></div>
        <div class="score-bar" aria-hidden="true"><span class="score-fill score-${score.value}"></span>${previous === undefined ? "" : `<i class="previous-tick mark-${previous}" title="Previous solve: ${previous}/10"></i>`}</div>
        <div class="score-delta">${baseline ? `<span class="delta ${delta.className}">${escapeHtml(delta.text)}</span> vs last` : "First solve"}</div>
      </div>
      <div class="score-explanation"><span>Why</span><p>${escapeHtml(score.reason)}</p>
        ${score.evidence?.length ? `<details class="score-details"><summary>Evidence</summary><ul class="evidence-list">${score.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
      </div>
    </article>`;
  }).join("");
  const currentRank = complexityRank(analysis.complexity.current.time);
  const suggestedRank = complexityRank(analysis.complexity.suggested.time);
  const suggestedIsBetter = suggestedRank >= 0 && currentRank >= 0 && suggestedRank < currentRank;
  const hintRows = [["repeatedWork", "Repeated work"], ["bottleneck", "Bottleneck"], ["structure", "Structure"]];
  const hints = hintRows.map(([key, title], index) => {
    const revealed = revealedHints[analysis.id]?.includes(key);
    const canReveal = index === 0 || revealedHints[analysis.id]?.includes(hintRows[index - 1][0]);
    return `<div class="hint-row"><span>${index + 1}</span><strong>${title}</strong>${revealed
      ? `<span class="hint-copy">${escapeHtml(analysis.hints?.[key] || "No hint is available.")}</span>`
      : `<button class="hint-button" data-action="reveal-hint" data-id="${escapeHtml(analysis.id)}" data-hint="${key}" ${canReveal ? "" : "disabled"}>Reveal</button>`}</div>`;
  }).join("");

  app.innerHTML = `${milestone ? `<p class="milestone">${escapeHtml(milestone)}</p>` : ""}
    <p class="result-meta">${analysis.demo ? "Sample preview" : `Analyzed ${ago(analysis.createdAt)} · ${escapeHtml(analysis.model?.name || "Local model")}`}</p>
    <section class="score-grid" aria-label="Solution scores">${scoreCards}</section>
    <section aria-labelledby="complexity-title">
      <h2 class="section-title" id="complexity-title">Complexity</h2>
      <table class="comparison"><thead><tr><th></th><th>Yours</th><th>Suggested</th></tr></thead>
        <tbody>
          <tr><td>Approach</td><td>${escapeHtml(analysis.complexity.current.approach)}</td><td class="${suggestedIsBetter ? "better" : ""}">${escapeHtml(analysis.complexity.suggested.approach)}</td></tr>
          <tr><td>Time</td><td>${escapeHtml(analysis.complexity.current.time)}</td><td class="${suggestedIsBetter ? "better" : ""}">${escapeHtml(analysis.complexity.suggested.time)}</td></tr>
          <tr><td>Space</td><td>${escapeHtml(analysis.complexity.current.space)}</td><td>${escapeHtml(analysis.complexity.suggested.space)}</td></tr>
        </tbody>
      </table>
      <p class="comparison-label">Your estimate: ${analysis.complexity.current.confidence === "llm_only" ? "LLM only" : "Static + LLM"} · Suggested: LLM-claimed</p>
    </section>
    ${analysis.concepts.length ? `<section><h2 class="section-title">Concepts</h2><div class="concept-list">${analysis.concepts.slice(0, 3).map((item) => `<div class="concept-item"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.patternTag || analysis.primaryPattern)}</span><p>${escapeHtml(item.why)}</p></div>`).join("")}</div></section>` : ""}
    ${analysis.recommendations.length ? `<section class="recommendations"><h3>Next steps</h3><ol>${analysis.recommendations.slice(0, 2).map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ol></section>` : ""}
    ${lowScore ? `<section class="revisit"><h2 class="section-title">Re-attempt</h2><p class="revisit-date">${review ? `Re-attempt on <span>${dateLabel(review.dueAt)}</span>` : "A low score is ready to revisit"}</p><h2 class="section-title">Hints</h2>${hints}</section>` : ""}
    <div class="result-actions"><button class="ghost-button" data-nav="analyze">Analyze another solution</button></div>`;
}

function renderOverview() {
  const sorted = latestAnalyses();
  const active = activeReviews();
  const realAnalyses = state.analyses.filter((item) => !item.demo);
  const avg = realAnalyses.length
    ? (realAnalyses.reduce((sum, item) => sum + item.scores.quality.value + item.scores.readability.value + item.scores.concept.value, 0) / (realAnalyses.length * 3)).toFixed(1)
    : "—";
  const dueCount = active.filter((review) => new Date(review.dueAt) <= new Date()).length;
  const banner = state.analyses.some((item) => item.demo)
    ? `<div class="sample-banner"><span>✦</span><span><strong>Sample workspace</strong> — explore a preview analysis, or clear it to start fresh.</span><span class="banner-spacer"></span><button class="text-button" data-action="clear-sample">Clear preview</button></div>`
    : "";
  app.innerHTML = `${banner}
    <div class="page-heading"><div><div class="eyebrow">YOUR PRACTICE, IN FOCUS</div><h1>Solve with intention.</h1><p class="subheading">A little reflection turns accepted into understood.</p></div><div class="date-label">${dateLabel(new Date(), { weekday: "long", month: "long", day: "numeric" })}</div></div>
    <div class="dashboard-grid">
      <section class="hero-card">
        <div class="eyebrow">YOUR NEXT STEP</div>
        <h2>Make every accepted solution count.</h2>
        <p>Review the trade-offs, spot a better pattern, and keep the concepts that matter.</p>
        <div class="hero-actions"><button class="button button-primary" data-nav="analyze">Analyze a solution <span aria-hidden="true">↗</span></button><button class="button button-ghost" data-nav="reviews">View due reviews</button></div>
        <div class="hero-decoration" aria-hidden="true">↗</div>
      </section>
      <section class="card stats-card">
        <div class="card-title-row"><h2>Your snapshot</h2><span class="tiny-label">LOCAL</span></div>
        <div class="stats-list">
          <div class="stat-item"><span class="stat-icon">▤</span><div class="stat-meta"><span>Analyzed</span><strong>${realAnalyses.length}</strong></div><span class="stat-trend neutral">solves</span></div>
          <div class="stat-item"><span class="stat-icon">◷</span><div class="stat-meta"><span>Reviews due</span><strong>${dueCount}</strong></div><span class="stat-trend ${dueCount ? "" : "neutral"}">${dueCount ? "ready" : "all clear"}</span></div>
          <div class="stat-item"><span class="stat-icon">↗</span><div class="stat-meta"><span>Average score</span><strong>${avg}<small class="average-unit"> / 10</small></strong></div><span class="stat-trend neutral">${realAnalyses.length ? "across all" : "to begin"}</span></div>
        </div>
        <p class="stats-footnote">Progress is personal. No streaks, ranks, or public scores.</p>
      </section>
    </div>
    <div class="section-row"><h2>Recent analyses</h2><button class="link-button" data-nav="history">View history →</button></div>
    <section class="card recent-card">${sorted.length ? sorted.slice(0, 4).map(renderRecentRow).join("") : `<div class="empty-state"><strong>Your first reflection starts here.</strong>Analyze a solution to build a private history of your progress.<br><br><button class="button button-dark" data-nav="analyze">Analyze a solution</button></div>`}</section>`;
}

function renderAnalyze(errorMessage = "") {
  app.innerHTML = `<div class="page-heading"><h1>Analyze a solution</h1><p class="subheading">Paste an accepted solution. Nothing is sent until you choose Analyze.</p></div>
    <div class="form-intro"><h2>Manual analysis</h2><p>This local web app does not read LeetCode or access a browser editor.</p></div>
    <form id="analysis-form">
      <div class="field-grid">
        <div class="field"><label for="problem-title">Problem title</label><input id="problem-title" name="title" placeholder="e.g. Two Sum" maxlength="160" required></div>
        <div class="field"><label for="problem-slug">Problem slug</label><input id="problem-slug" name="problemSlug" placeholder="e.g. two-sum" maxlength="120" pattern="[A-Za-z0-9\\-]+" required><span class="field-help">Used only to match local history.</span></div>
        <div class="field"><label for="language">Language</label><select id="language" name="language"><option>Python</option><option>JavaScript</option><option>TypeScript</option><option>Java</option><option>C++</option><option>C#</option><option>Go</option><option>Rust</option><option>Other</option></select></div>
        <div class="field"><label for="threshold">Low-score threshold</label><select id="threshold" name="threshold">${Array.from({ length: 9 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${state.settings.threshold === n ? "selected" : ""}>${n} / 10</option>`).join("")}</select></div>
        <div class="field full"><label for="solution-code">Your solution</label><textarea id="solution-code" name="code" maxlength="30000" spellcheck="false" placeholder="Paste your accepted solution…" required></textarea><span class="field-help">Up to 30,000 characters. Code is not saved by default.</span></div>
      </div>
      <div class="form-footer"><span class="privacy-note"><span class="local-dot"></span>Provider key stays on the local server</span><button id="analyze-button" class="button button-primary" type="submit">Analyze</button></div>
      ${errorMessage ? `<div class="error-box" role="alert">${escapeHtml(errorMessage)}</div>` : ""}
    </form>`;
}

function renderReviews() {
  const reviews = activeReviews();
  const now = new Date();
  const due = reviews.filter((review) => new Date(review.dueAt) <= now);
  const later = reviews.filter((review) => new Date(review.dueAt) > now);
  const renderGroup = (title, items) => `<section class="queue-group"><h2>${title}</h2>${items.map((review) => {
    const analysis = state.analyses.find((item) => item.id === review.sourceAnalysisId);
    const isToday = new Date(review.dueAt).toDateString() === now.toDateString();
    const dayLabel = isToday ? "Due today" : new Date(review.dueAt) < now ? ago(review.dueAt) : dateLabel(review.dueAt);
    const hints = analysis?.hints || {};
    return `<article class="queue-item">
      <div class="queue-main"><strong>${escapeHtml(review.title || review.problemSlug)}</strong><small>${escapeHtml(analysis?.primaryPattern || "Review")} · ${dayLabel} · score ${review.lowestScore}/10</small>
        <div class="hint-reveal" id="hints-${escapeHtml(review.id)}"><strong>Hints</strong><br>${[["Repeated work", hints.repeatedWork], ["Bottleneck", hints.bottleneck], ["Structure", hints.structure]].filter(([, text]) => text).map(([name, text]) => `<span>${name}: ${escapeHtml(text)}</span><br>`).join("") || "Run an analysis to unlock hints."}</div>
      </div>
      <div class="queue-actions"><button class="button-small" data-action="reveal-review-hints" data-id="${escapeHtml(review.id)}">Hints</button><button class="button-small" data-action="attempt-review" data-id="${escapeHtml(review.id)}">Open</button></div>
    </article>`;
  }).join("")}</section>`;
  app.innerHTML = reviews.length
    ? `${due.length ? renderGroup("Due", due) : ""}${later.length ? renderGroup("Later", later) : ""}`
    : `<section class="empty-state"><strong>Nothing due</strong><p>Low scores come back here on their re-attempt date.</p><button class="button" data-nav="analyze">Analyze a solution</button></section>`;
}

function renderHistory() {
  const sorted = latestAnalyses();
  app.innerHTML = sorted.length
    ? sorted.map((analysis) => `<button class="history-item" data-action="open-analysis" data-id="${escapeHtml(analysis.id)}">
        <span class="history-main"><strong>${escapeHtml(analysis.title)}</strong><small>${escapeHtml(analysis.primaryPattern)}</small></span>
        <span class="history-score">${Object.keys(labels).map((key) => analysis.scores[key].value).join(" · ")}</span>
        <span class="history-date">${dateLabel(analysis.createdAt)}</span>
      </button>`).join("")
    : `<section class="empty-state"><strong>No earlier solves</strong><p>Analyses you save will appear here.</p><button class="button" data-nav="analyze">Analyze a solution</button></section>`;
}

function renderSettings() {
  app.innerHTML = `<div class="settings-stack">
    <section class="settings-section"><h3>Prompts</h3>
      <div class="setting-row"><div><strong>Low-score threshold</strong><small>Schedule a review at or below this score.</small></div><select id="setting-threshold">${Array.from({ length: 9 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${state.settings.threshold === n ? "selected" : ""}>${n} / 10</option>`).join("")}</select></div>
      <div class="setting-row"><div><strong>Milestone animation</strong><small>Off when reduced motion is enabled.</small></div><label class="switch"><input id="setting-animations" type="checkbox" ${state.settings.animations ? "checked" : ""}><span></span></label></div>
    </section>
    <section class="settings-section"><h3>Analysis</h3><p>The local server reads the provider key from <code>.env</code>. It is not stored in browser storage.</p>
      <div class="setting-row"><div><strong>Configured model</strong><small>OpenAI-compatible provider</small></div><span>${escapeHtml(providerInfo.model)}</span></div>
      <div class="provider-status"><span class="local-dot ${providerInfo.providerConfigured ? "provider-configured" : "provider-missing"}"></span>${providerInfo.providerConfigured ? "Provider is ready." : "No provider key. Add one to .env and restart."}</div>
      <div class="setting-row"><div><strong>Keep submitted code</strong><small>Off by default. Hashes are used for cache matching.</small></div><label class="switch"><input id="setting-keep-code" type="checkbox" ${state.settings.keepCode ? "checked" : ""}><span></span></label></div>
    </section>
    <section class="settings-section"><h3>Data</h3><p>Export or delete local analyses, reviews, and events.</p>
      <div class="setting-actions"><button class="button-outline" data-action="export">Export JSON</button><button class="button-outline button-danger" data-action="delete-all">Delete all data</button></div>
    </section>
    <p class="privacy-foot">Code is sent to your configured provider only when you choose Analyze. This development server should remain bound to 127.0.0.1.</p>
  </div>`;
}

function render() {
  const selectedView = currentView === "analyze" ? "result" : currentView;
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.nav === selectedView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const headerButton = document.querySelector(".panel-heading .icon-button");
  const heading = document.querySelector(".panel-heading-copy");
  const activeAnalysis = state.analyses.find((item) => item.id === activeAnalysisId);
  if (currentView === "settings") {
    heading.querySelector("strong").textContent = "Settings";
    heading.querySelector("span").textContent = "Local preferences and data";
    headerButton.dataset.nav = "result";
    headerButton.textContent = "‹";
    headerButton.setAttribute("aria-label", "Back to result");
    headerButton.title = "Back";
  } else {
    const isAnalyze = currentView === "analyze";
    heading.querySelector("strong").textContent = isAnalyze ? "New analysis" : activeAnalysis?.title || "Hiregram";
    heading.querySelector("span").textContent = isAnalyze ? "Manual solution review"
      : activeAnalysis ? `${activeAnalysis.language} · ${activeAnalysis.primaryPattern}` : "Local analysis companion";
    headerButton.dataset.nav = "settings";
    headerButton.textContent = "⚙";
    headerButton.setAttribute("aria-label", "Open settings");
    headerButton.title = "Settings";
  }
  updateReviewCount();
  if (currentView === "result") renderResult();
  if (currentView === "analyze") renderAnalyze();
  if (currentView === "reviews") renderReviews();
  if (currentView === "history") renderHistory();
  if (currentView === "settings") renderSettings();
}

function navigate(view) {
  if (!pageNames[view]) return;
  currentView = view;
  render();
  document.querySelector(".page-content").scrollTop = 0;
}

async function hashCode(code) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function nextReviewDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function updateReview(analysis, previousReview = null) {
  const values = Object.values(analysis.scores).map((score) => score.value);
  const lowestScore = Math.min(...values);
  if (lowestScore <= state.settings.threshold) {
    const step = previousReview && previousReview.status !== "done" ? 0 : 0;
    const review = {
      id: previousReview?.id || crypto.randomUUID(),
      problemSlug: analysis.problemSlug,
      title: analysis.title,
      step,
      dueAt: nextReviewDate(REVIEW_LADDER[step]),
      lowestScore,
      sourceAnalysisId: analysis.id,
      status: "due",
    };
    state.reviews = state.reviews.filter((item) => item.problemSlug !== analysis.problemSlug || item.status === "done");
    state.reviews.unshift(review);
    return;
  }
  if (previousReview && previousReview.status !== "done") {
    const nextStep = Math.min(previousReview.step + 1, REVIEW_LADDER.length - 1);
    previousReview.step = nextStep;
    previousReview.lowestScore = lowestScore;
    previousReview.sourceAnalysisId = analysis.id;
    previousReview.status = "scheduled";
    previousReview.dueAt = nextReviewDate(REVIEW_LADDER[nextStep]);
  }
}

async function submitAnalysis(form) {
  const formData = new FormData(form);
  const input = {
    problemSlug: String(formData.get("problemSlug") || "").trim().toLowerCase(),
    title: String(formData.get("title") || "").trim(),
    language: String(formData.get("language") || "").trim(),
    code: String(formData.get("code") || ""),
  };
  state.settings.threshold = Number(formData.get("threshold")) || state.settings.threshold;
  persist();
  const button = document.querySelector("#analyze-button");
  button.disabled = true;
  button.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span> Analyzing…';
  try {
    const hash = await hashCode(input.code);
    const cached = latestAnalyses().find((item) =>
      item.codeHash === hash && item.rubricVersion === RUBRIC_VERSION
      && item.model?.name === providerInfo.model && !item.demo);
    if (cached) {
      renderAnalyze();
      showToast("Matching analysis found in local history. No model request was made.");
      openAnalysis(cached.id);
      return;
    }
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, threshold: state.settings.threshold }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || `Analysis failed (${response.status}).`);
    const priorReview = state.reviews.find((review) => !review.demo && review.problemSlug === input.problemSlug
      && review.status !== "done");
    const analysis = {
      id: crypto.randomUUID(),
      schemaVersion: "1.0",
      problemSlug: input.problemSlug,
      title: input.title,
      language: input.language,
      codeHash: hash,
      codeRetention: state.settings.keepCode ? "retain_with_consent" : "hash_only",
      ...(state.settings.keepCode ? { code: input.code } : {}),
      ...body.result,
      model: { provider: "User-configured provider", name: body.model },
      rubricVersion: body.rubricVersion,
      createdAt: new Date().toISOString(),
      demo: false,
    };
    const milestone = state.settings.animations && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? milestoneFor(analysis, priorReview)
      : null;
    state.analyses.unshift(analysis);
    updateReview(analysis, priorReview);
    addEvent("analysis_created", analysis.id);
    if (milestone) addEvent("milestone_shown", analysis.id);
    justAnalyzedId = analysis.id;
    milestoneByAnalysis[analysis.id] = milestone;
    persist();
    render();
    showToast(milestone ? `Milestone: ${milestone}` : "Analysis saved locally.");
    openAnalysis(analysis.id);
  } catch (error) {
    renderAnalyze(error.message);
  }
}

function createDemoAnalysis() {
  const analysis = makeSample();
  analysis.id = crypto.randomUUID();
  analysis.createdAt = new Date().toISOString();
  analysis.demo = false;
  analysis.model = { provider: "Sample preview", name: "Example result" };
  analysis.codeHash = "demo-" + analysis.id;
  state.analyses.unshift(analysis);
  addEvent("analysis_created", analysis.id);
  justAnalyzedId = analysis.id;
  milestoneByAnalysis[analysis.id] = state.settings.animations ? "A new solution, thoughtfully reviewed." : null;
  persist();
  render();
  openAnalysis(analysis.id);
}

function openAnalysis(id) {
  if (!state.analyses.some((item) => item.id === id)) return showToast("That analysis is no longer available.");
  activeAnalysisId = id;
  currentView = "result";
  addEvent("analysis_opened", id);
  render();
  persist();
}

function revealHint(id, key) {
  const analysis = state.analyses.find((item) => item.id === id);
  const hint = analysis?.hints?.[key];
  if (!hint) return showToast("No hint is available for this analysis.");
  const order = ["repeatedWork", "bottleneck", "structure"];
  const index = order.indexOf(key);
  if (index > 0 && !revealedHints[id]?.includes(order[index - 1])) return;
  revealedHints[id] ||= [];
  if (revealedHints[id].includes(key)) return;
  revealedHints[id].push(key);
  addEvent("hint_revealed", id);
  persist();
  renderResult();
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    analyses: state.analyses,
    reviews: state.reviews,
    events: state.events,
    settings: state.settings,
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hiregram-local-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Local data export downloaded.");
}

async function loadProviderInfo() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error(`Local server returned ${response.status}.`);
    providerInfo = await response.json();
    if (currentView === "settings") renderSettings();
  } catch (error) {
    providerInfo = { model: "Unavailable", providerConfigured: false, error: error.message };
  }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const { action, id, hint } = control.dataset;
  if (action === "open-analysis") return openAnalysis(id);
  if (action === "clear-sample") {
    state.analyses = state.analyses.filter((analysis) => !analysis.demo);
    state.reviews = state.reviews.filter((review) => !review.demo);
    persist();
    render();
    return showToast("Preview data cleared. Your workspace is ready.");
  }
  if (action === "reveal-review-hints") {
    const element = document.querySelector(`#hints-${CSS.escape(id)}`);
    element?.classList.toggle("open");
    addEvent("review_hints_revealed", state.reviews.find((review) => review.id === id)?.sourceAnalysisId);
    persist();
    return;
  }
  if (action === "attempt-review") {
    const review = state.reviews.find((item) => item.id === id);
    if (!review) return showToast("Review is no longer available.");
    navigate("analyze");
    document.querySelector("#problem-title").value = review.title || review.problemSlug;
    document.querySelector("#problem-slug").value = review.problemSlug;
    document.querySelector("#language").value = state.analyses.find((item) => item.id === review.sourceAnalysisId)?.language || "Python";
    document.querySelector("#solution-code").focus();
    return;
  }
  if (action === "reveal-hint") return revealHint(id, hint);
  if (action === "export") return exportData();
  if (action === "delete-all") {
    if (!window.confirm("Delete all local analyses, reviews, and event history? This cannot be undone.")) return;
    state.analyses = [];
    state.reviews = [];
    state.events = [];
    persist();
    render();
    showToast("All local analysis data was deleted.");
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "analysis-form") return;
  event.preventDefault();
  submitAnalysis(event.target);
});

document.addEventListener("change", (event) => {
  if (event.target.id === "threshold") {
    state.settings.threshold = Number(event.target.value);
    persist();
  }
  if (event.target.id === "setting-threshold") {
    state.settings.threshold = Number(event.target.value);
    persist();
    showToast("Review threshold updated.");
  }
  if (event.target.id === "setting-keep-code") {
    state.settings.keepCode = event.target.checked;
    persist();
    showToast(event.target.checked ? "Code retention enabled for future analyses." : "Code retention is off for future analyses.");
  }
  if (event.target.id === "setting-animations") {
    state.settings.animations = event.target.checked;
    document.body.classList.toggle("reduce-motion", !event.target.checked);
    persist();
    showToast(event.target.checked ? "Milestone animations enabled." : "Milestone animations disabled.");
  }
});

document.body.classList.toggle("reduce-motion", !state.settings.animations);
persist();
render();
loadProviderInfo();
