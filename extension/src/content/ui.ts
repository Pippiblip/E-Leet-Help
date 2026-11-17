import type { StoredResult } from "../shared/types";
import type { ReviewItem, UserSettings } from "./storage";

type Tab = "result" | "due" | "history" | "settings";

export interface PanelView {
  title: string;
  subtitle: string;
  activeTab: Tab;
  result: StoredResult | null;
  previous: StoredResult | null;
  results: StoredResult[];
  reviews: ReviewItem[];
  settings: UserSettings;
  busy: boolean;
  error: string | null;
  canAnalyze: boolean;
  cached: boolean;
}

export interface UiActions {
  analyze(): void;
  retry(): void;
  cancel(): void;
  dismiss(): void;
  snooze(): void;
  disableToast(): void;
  setTab(tab: Tab): void;
  openProblem(slug: string): void;
  selectResult(result: StoredResult): void;
  exportData(): void;
  deleteAll(): void;
  updateSettings(settings: UserSettings): void;
}

export interface ToastActions {
  activate(): void;
  dismiss(): void;
  snooze(): void;
  disable(): void;
}

const css = `
:host { all: initial; color-scheme: light dark; font-family: ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
* { box-sizing: border-box; }
.toast-wrap,.panel-wrap { pointer-events: auto; color: var(--text); font-size: 14px; }
.toast-wrap { position: fixed; right: 24px; bottom: 24px; width: min(360px,calc(100vw - 32px)); animation: enter 200ms cubic-bezier(.2,0,0,1); }
.toast { min-height: 48px; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--border); border-radius:16px; background:var(--raised); box-shadow:0 4px 16px rgba(0,0,0,.08); }
.toast-label { flex:1; min-width:0; padding-left:8px; color:var(--text); font-size:14px; font-weight:500; line-height:20px; }
.panel-wrap { position:fixed; inset:0 0 0 auto; width:min(400px,100vw); height:100dvh; background:var(--bg); border-left:1px solid var(--border); display:flex; flex-direction:column; box-shadow:-8px 0 28px rgba(0,0,0,.12); }
.header { min-height:48px; display:flex; align-items:center; gap:8px; padding:8px 12px; }
.heading { flex:1; min-width:0; }
.heading strong,.heading small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.heading strong { font-size:14px; font-weight:500; line-height:20px; }
.heading small { color:var(--text-3); font-size:12px; line-height:16px; }
.tabs { min-height:40px; display:flex; align-items:stretch; border-bottom:1px solid var(--border); padding:0 12px; gap:4px; }
.tabs button { position:relative; border:0; background:transparent; color:var(--text-2); padding:0 8px; font-size:13px; font-weight:500; }
.tabs button[aria-selected="true"] { color:var(--text); }
.tabs button[aria-selected="true"]::after { content:""; position:absolute; bottom:0; left:8px; right:8px; height:2px; background:var(--text); }
.tabs .spacer { flex:1; }
.content { overflow:auto; flex:1; padding:20px 16px 28px; }
.section { margin:0 0 24px; }
.section:last-child { margin-bottom:0; }
.section-title { margin:0 0 10px; color:var(--text-3); font-size:12px; font-weight:500; line-height:16px; }
.scores { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.score { min-width:0; padding:0; border:0; text-align:left; background:transparent; color:var(--text); }
.score-label { display:block; color:var(--text-3); font-size:12px; line-height:16px; }
.score-number { display:block; margin-top:4px; font-size:28px; font-weight:500; line-height:32px; font-variant-numeric:tabular-nums; }
.milestone-number { text-decoration:underline; text-decoration-color:var(--accent); text-decoration-thickness:2px; text-underline-offset:4px; }
.score-number small { color:var(--text-3); font-size:13px; }
.delta { display:block; min-height:16px; margin-top:4px; color:var(--text-3); font-size:12px; line-height:16px; }
.delta.up { color:var(--positive); }
.delta.down { color:var(--negative); }
.bar { position:relative; height:4px; margin-top:10px; border-radius:2px; background:var(--border-strong); }
.bar-fill { height:4px; border-radius:2px; background:var(--text-2); }
.bar-tick { position:absolute; top:-4px; width:2px; height:12px; background:var(--accent); }
.milestone { margin-top:12px; color:var(--text-2); font-size:13px; line-height:20px; }
.milestone::before { content:""; display:inline-block; width:6px; height:6px; margin:0 8px 1px 0; border-radius:50%; background:var(--accent); }
.comparison { display:grid; grid-template-columns:56px minmax(0,1fr) minmax(0,1fr); gap:8px 4px; align-items:start; }
.comparison.collapsed { grid-template-columns:56px minmax(0,1fr); }
.comparison > * { min-width:0; }
.comparison-head,.row-label,.confidence { color:var(--text-3); font-size:12px; line-height:16px; }
.comparison-cell { padding:2px 4px; border-radius:4px; overflow-wrap:anywhere; font-size:13px; line-height:20px; }
.mono { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-variant-numeric:tabular-nums; }
.better { background:var(--accent-tint); }
.confidence { margin-top:12px; }
.confidence-dot { display:inline-block; width:6px; height:6px; margin-right:6px; border-radius:50%; background:var(--text-3); }
.concept { margin:0 0 12px; }
.concept strong { font-size:14px; font-weight:500; }
.concept span { float:right; color:var(--text-3); font-size:12px; }
.concept p { margin:3px 0 0; color:var(--text-2); font-size:13px; line-height:20px; }
.line { display:flex; gap:10px; margin:8px 0; font-size:13px; line-height:20px; }
.line-index { width:16px; color:var(--text-3); }
.privacy,.muted { color:var(--text-3); font-size:12px; line-height:18px; }
.button { min-height:32px; padding:0 12px; border:1px solid var(--border-strong); border-radius:8px; color:var(--text); background:transparent; font:500 13px/18px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; cursor:pointer; }
.button.primary { border-color:var(--accent); background:var(--accent); color:#1A1A1A; }
.button.ghost { border-color:transparent; color:var(--text-2); }
.button.small { min-height:32px; padding:0 8px; }
.button:disabled { opacity:.45; cursor:not-allowed; }
.button:hover:not(:disabled) { background:var(--surface); }
.button.primary:hover:not(:disabled) { filter:brightness(.97); }
.button:focus-visible,select:focus-visible,input:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.toast-menu { position:absolute; right:0; bottom:56px; z-index:2; width:200px; padding:4px; border:1px solid var(--border); border-radius:8px; background:var(--raised); box-shadow:0 4px 16px rgba(0,0,0,.12); }
.toast-menu button { display:block; width:100%; min-height:36px; border:0; border-radius:4px; text-align:left; background:transparent; color:var(--text); font:400 13px/20px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; cursor:pointer; }
.toast-menu button:hover { background:var(--surface); }
.disclosure { margin-top:12px; }
.disclosure summary { min-height:40px; cursor:pointer; color:var(--text-2); font-size:13px; }
.disclosure p { color:var(--text-2); font-size:13px; line-height:20px; }
.review-row,.history-row { display:flex; align-items:center; gap:8px; min-height:48px; border-bottom:1px solid var(--border); }
.review-main,.history-main { flex:1; min-width:0; }
.review-main strong,.review-main small,.history-main small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.review-main strong { font-size:14px; font-weight:500; }
.review-main small,.history-main small { color:var(--text-3); font-size:12px; line-height:18px; }
.history-row { cursor:pointer; }
.history-scores { color:var(--text); font-size:13px; }
.empty { padding:24px 0; }
.empty strong { display:block; font-size:14px; font-weight:500; }
.empty p { margin:6px 0 12px; color:var(--text-2); font-size:13px; line-height:20px; }
.setting { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:48px; border-bottom:1px solid var(--border); }
.setting label { color:var(--text); font-size:14px; }
.setting select { max-width:180px; min-height:32px; border:1px solid var(--border-strong); border-radius:8px; padding:0 8px; color:var(--text); background:var(--bg); }
.confirm { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.error { margin:0 0 12px; color:var(--negative); font-size:13px; line-height:20px; }
.loading { color:var(--text-2); font-size:13px; line-height:20px; }
.ring { animation:ring 600ms cubic-bezier(.2,0,0,1) both; }
@keyframes enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes ring { from { box-shadow:0 0 0 0 rgba(255,161,22,.6); } to { box-shadow:0 0 0 8px rgba(255,161,22,0); } }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms !important; scroll-behavior:auto !important; } }
:host { --bg:#fff; --raised:#fff; --surface:#F7F8FA; --text:#262626; --text-2:#5C5C5C; --text-3:#707070; --border:rgba(38,38,38,.10); --border-strong:rgba(38,38,38,.16); --accent:#FFA116; --accent-text:#A85A00; --positive:#00806F; --negative:#C62828; --accent-tint:rgba(255,161,22,.12); }
:host([data-theme="dark"]) { --bg:#1A1A1A; --raised:#282828; --surface:#282828; --text:#EFF1F6; --text-2:#A6A8AD; --text-3:#8E9096; --border:rgba(239,241,246,.08); --border-strong:rgba(239,241,246,.14); --accent-text:#FFA116; --positive:#00B8A3; --negative:#FF6B66; }
`;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text: string, action: () => void, className = "button"): HTMLButtonElement {
  const element = node("button", text, className);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

function shortAgo(ts: number): string {
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
  if (!days) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function delta(current: number, previous?: number): { label: string; className: string } {
  if (previous === undefined) return { label: "first solve", className: "" };
  const difference = current - previous;
  if (Math.abs(difference) <= 1) return { label: "same", className: "" };
  return {
    label: `${difference > 0 ? "+" : ""}${difference} vs last`,
    className: difference > 0 ? "up" : "down",
  };
}

function complexityRank(value: string): number {
  return ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)", "other"].indexOf(value);
}

export class AnalyzerUi {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private toastTimer: number | undefined;
  private animatedIds = new Set<string>();

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "lc-analyzer-root";
    this.host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    this.shadow = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = css;
    this.shadow.append(style);
    document.documentElement.append(this.host);
    this.syncTheme();
    const observer = new MutationObserver(() => this.syncTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  }

  private syncTheme(): void {
    const dark = document.documentElement.classList.contains("dark")
      || document.documentElement.dataset.theme === "dark"
      || document.body?.classList.contains("dark")
      || (!document.documentElement.classList.contains("light")
        && window.matchMedia("(prefers-color-scheme: dark)").matches);
    this.host.setAttribute("data-theme", dark ? "dark" : "light");
  }

  showToast(text: string, actionLabel: string, actions: ToastActions): void {
    this.clearToast();
    const wrap = node("div", undefined, "toast-wrap");
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    const toast = node("div", undefined, "toast");
    toast.append(node("span", text, "toast-label"));
    toast.append(button(actionLabel, actions.activate, "button primary"));
    const menuButton = button("⋯", () => {
      const current = wrap.querySelector(".toast-menu");
      if (current) {
        current.remove();
      } else {
        const menu = node("div", undefined, "toast-menu");
        menu.append(
          button("Dismiss", actions.dismiss, "menu-item"),
          button("Snooze 24 hours", actions.snooze, "menu-item"),
          button("Don’t show again", actions.disable, "menu-item"),
        );
        wrap.append(menu);
      }
    }, "button ghost small");
    menuButton.setAttribute("aria-label", "Toast options");
    toast.append(menuButton);
    wrap.append(toast);
    this.shadow.append(wrap);
    const dismiss = (): void => {
      if (!wrap.matches(":hover") && !wrap.contains(document.activeElement)) {
        wrap.remove();
        this.toastTimer = undefined;
      } else {
        this.toastTimer = window.setTimeout(dismiss, 1000);
      }
    };
    this.toastTimer = window.setTimeout(dismiss, 8000);
  }

  clearToast(): void {
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.shadow.querySelector(".toast-wrap")?.remove();
  }

  showPanelClose(): void {
    this.shadow.querySelector(".panel-wrap")?.remove();
  }

  showPanel(view: PanelView, actions: UiActions): void {
    this.shadow.querySelector(".panel-wrap")?.remove();
    const wrap = node("section", undefined, "panel-wrap");
    wrap.setAttribute("aria-label", "LeetCode analysis");
    const header = node("header", undefined, "header");
    const heading = node("div", undefined, "heading");
    heading.append(node("strong", view.activeTab === "settings" ? "Settings" : view.title));
    heading.append(node("small", view.activeTab === "settings" ? "Preferences and local data" : view.subtitle));
    header.append(heading);
    if (view.activeTab === "settings") {
      header.append(button("Back", () => actions.setTab("result"), "button ghost small"));
    } else {
      header.append(button("Close", actions.dismiss, "button ghost small"));
    }
    wrap.append(header);

    if (view.activeTab !== "settings") {
      const tabs = node("nav", undefined, "tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Analysis views");
      for (const [tab, label] of [["result", "Result"], ["due", `Due ${view.reviews.filter((r) => r.due_at <= Date.now()).length}`], ["history", "History"]] as const) {
        const tabButton = button(label, () => actions.setTab(tab), "tab");
        tabButton.setAttribute("role", "tab");
        tabButton.setAttribute("aria-selected", String(view.activeTab === tab));
        tabs.append(tabButton);
      }
      const spacer = node("span", undefined, "spacer");
      tabs.append(spacer, button("Settings", () => actions.setTab("settings"), "button ghost small"));
      wrap.append(tabs);
    }

    const content = node("div", undefined, "content");
    if (view.activeTab === "result") this.renderResult(content, view, actions);
    else if (view.activeTab === "due") this.renderDue(content, view, actions);
    else if (view.activeTab === "history") this.renderHistory(content, view, actions);
    else this.renderSettings(content, view, actions);
    wrap.append(content);
    this.shadow.append(wrap);
    wrap.addEventListener("keydown", (event) => {
      if (event.key === "Escape") actions.dismiss();
    });
  }

  private renderResult(content: HTMLElement, view: PanelView, actions: UiActions): void {
    const result = view.result;
    if (!result) {
      const empty = node("section", undefined, "empty");
      empty.append(node("strong", "No analysis yet"));
      empty.append(node("p", view.canAnalyze ? "Your accepted solution is ready for an optional analysis." : "Submit a solution and accept it to begin."));
      if (view.error) {
        empty.append(node("p", view.error, "error"));
        empty.append(button("Retry", actions.retry, "button"));
        empty.append(button("Open settings", () => actions.setTab("settings"), "button ghost"));
      }
      if (view.canAnalyze && !view.busy) empty.append(button("Analyze", actions.analyze, "button primary"));
      empty.append(node("p", "After you click Analyze, code is sent to the configured server and Anthropic API. This extension does not save source code; Anthropic retention terms apply.", "privacy"));
      content.append(empty);
    } else {
      this.renderScores(content, result, view.previous, view.settings.animation, view.cached, view);
      this.renderComplexity(content, result, view.previous, view.settings.threshold);
      this.renderConcepts(content, result);
      if (result.hint) {
        const hint = node("details", undefined, "disclosure");
        hint.append(node("summary", "Hint"));
        hint.append(node("p", result.hint));
        content.append(hint);
      }
      if (view.error) {
        content.append(node("p", view.error, "error"));
        content.append(button("Retry", actions.retry, "button"));
      }
      content.append(node("p", "Analysis is an estimate. Your code is sent only after you choose Analyze and is not retained by this extension or the server; Anthropic retention terms apply.", "privacy"));
    }
    if (view.busy) {
      content.append(node("div", "Analyzing", "loading"), button("Hide", actions.cancel, "button ghost"));
    }
    if (!view.busy && result && view.canAnalyze) content.append(button("Analyze again", actions.analyze, "button"));
  }

  private renderScores(
    content: HTMLElement,
    result: StoredResult,
    previous: StoredResult | null,
    animation: UserSettings["animation"],
    cached: boolean,
    view: PanelView,
  ): void {
    const section = node("section", undefined, "section");
    section.setAttribute("aria-label", "Scores");
    const grid = node("div", undefined, "scores");
    const keys = ["quality", "readability", "concept"] as const;
    for (const key of keys) {
      const item = node("div", undefined, "score");
      item.append(node("span", key[0].toUpperCase() + key.slice(1), "score-label"));
      const number = node("span", undefined, "score-number");
      const changed = previous ? previous.scores[key] !== result.scores[key] : true;
      const shouldAnimate = !cached && animation === "subtle" && changed
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        && !this.animatedIds.has(result.submission_id);
      number.textContent = `${shouldAnimate ? previous?.scores[key] ?? 0 : result.scores[key]}`;
      const suffix = node("small", " /10");
      number.append(suffix);
      if (shouldAnimate) {
        number.classList.add("ring");
        const start = previous?.scores[key] ?? 0;
        const end = result.scores[key];
        const began = performance.now();
        const tick = (now: number): void => {
          if (!number.isConnected) return;
          const progress = Math.min(1, (now - began) / 600);
          number.firstChild!.textContent = String(Math.round(start + (end - start) * progress));
          if (progress < 1) requestAnimationFrame(tick);
          else number.classList.remove("ring");
        };
        requestAnimationFrame(tick);
        number.addEventListener("click", () => {
          number.firstChild!.textContent = String(end);
          number.classList.remove("ring");
        }, { once: true });
      } else if (animation === "off" && changed) {
        number.classList.add("milestone-number");
      }
      item.append(number);
      const scoreDelta = delta(result.scores[key], previous?.scores[key]);
      item.append(node("span", scoreDelta.label, `delta ${scoreDelta.className}`));
      const bar = node("div", undefined, "bar");
      const fill = node("div", undefined, "bar-fill");
      fill.style.width = `${Math.max(0, Math.min(10, result.scores[key])) * 10}%`;
      bar.append(fill);
      if (previous) {
        const tick = node("span", undefined, "bar-tick");
        tick.style.left = `${Math.max(0, Math.min(10, previous.scores[key])) * 10}%`;
        tick.setAttribute("aria-label", `Previous score: ${previous.scores[key]} out of 10`);
        bar.append(tick);
      }
      item.append(bar);
      item.setAttribute("aria-label", `${key}, ${result.scores[key]} out of 10, ${scoreDelta.label}`);
      grid.append(item);
    }
    if (!cached) this.animatedIds.add(result.submission_id);
    section.append(grid);
    const oldTotal = previous ? Object.values(previous.scores).reduce((a, b) => a + b, 0) : -1;
    const newTotal = Object.values(result.scores).reduce((a, b) => a + b, 0);
    if (!previous || newTotal > oldTotal) {
      section.append(node("div", !previous ? "First analysis" : "A new personal best", "milestone"));
    }
    content.append(section);
  }

  private renderComplexity(
    content: HTMLElement,
    result: StoredResult,
    previous: StoredResult | null,
    threshold: number,
  ): void {
    const section = node("section", undefined, "section");
    section.append(node("h2", "Complexity", "section-title"));
    const lowScore = Math.min(...Object.values(result.scores)) <= threshold;
    const grid = node("div", undefined, "comparison");
    const rows = [
      ["Approach", "Your solution", result.suggested.approach, false],
      ["Time", result.complexity.time, result.suggested.time, true],
      ["Space", result.complexity.space, result.suggested.space, true],
    ] as const;
    if (lowScore) {
      grid.classList.add("collapsed");
      grid.append(node("span", ""), node("span", "Yours", "comparison-head"));
    } else {
      grid.append(node("span", ""), node("span", "Yours", "comparison-head"), node("span", "Suggested", "comparison-head"));
    }
    for (const [label, current, suggested, mono] of rows) {
      grid.append(node("span", label, "row-label"));
      grid.append(node("span", current, `comparison-cell${mono ? " mono" : ""}`));
      if (!lowScore) {
        const better = label === "Time"
          ? complexityRank(result.suggested.time) < complexityRank(result.complexity.time)
          : label === "Space" && complexityRank(result.suggested.space) < complexityRank(result.complexity.space);
        grid.append(node("span", suggested, `comparison-cell${mono ? " mono" : ""}${better ? " better" : ""}`));
      }
    }
    section.append(grid);
    const confidence = node("p", undefined, "confidence");
    confidence.append(node("span", undefined, "confidence-dot"));
    confidence.append(document.createTextNode("LLM estimate · Suggested is LLM-claimed"));
    section.append(confidence);
    if (lowScore) {
      section.append(button("Show suggested approach", () => {
        const details = node("p", `${result.suggested.approach} · ${result.suggested.time} time · ${result.suggested.space} space`);
        details.className = "muted";
        details.dataset.suggested = "true";
        const existing = section.querySelector("[data-suggested='true']");
        if (existing) existing.remove();
        else section.append(details);
      }, "button ghost"));
    }
    if (previous && previous.complexity.time !== result.complexity.time) {
      section.append(node("p", `Previous time estimate: ${previous.complexity.time}`, "muted"));
    }
    content.append(section);
  }

  private renderConcepts(content: HTMLElement, result: StoredResult): void {
    if (result.concepts.length) {
      const section = node("section", undefined, "section");
      section.append(node("h2", "Concepts", "section-title"));
      for (const concept of result.concepts.slice(0, 5)) {
        section.append(node("p", concept, "concept"));
      }
      content.append(section);
    }
  }

  private renderDue(content: HTMLElement, view: PanelView, actions: UiActions): void {
    const now = Date.now();
    const due = view.reviews.filter((review) => review.due_at <= now);
    const later = view.reviews.filter((review) => review.due_at > now);
    if (!view.reviews.length) {
      const empty = node("div", undefined, "empty");
      empty.append(node("strong", "Nothing due"));
      empty.append(node("p", "Low scores come back here on their re-attempt date"));
      content.append(empty);
      return;
    }
    for (const [title, rows] of [["Due", due], ["Later", later]] as const) {
      if (!rows.length) continue;
      const section = node("section", undefined, "section");
      section.append(node("h2", title, "section-title"));
      for (const review of rows) {
        const row = node("div", undefined, "review-row");
        const main = node("div", undefined, "review-main");
        main.append(node("strong", review.title || review.slug));
        const dueLabel = review.due_at <= now ? shortAgo(review.due_at) : formatDate(review.due_at);
        main.append(node("small", `${dueLabel} · score ${review.lowest_score}/10`));
        row.append(main);
        row.append(button("Open", () => actions.openProblem(review.slug), "button ghost small"));
        if (review.hint) {
          const disclosure = node("details", undefined, "disclosure");
          disclosure.append(node("summary", "Hints"));
          disclosure.append(node("p", review.hint));
          section.append(row, disclosure);
        } else {
          section.append(row);
        }
      }
      content.append(section);
    }
  }

  private renderHistory(content: HTMLElement, view: PanelView, actions: UiActions): void {
    const rows = [...view.results].sort((a, b) => b.ts - a.ts);
    if (!rows.length) {
      content.append(node("div", "No earlier solves", "empty"));
      return;
    }
    for (const result of rows) {
      const row = node("button", undefined, "history-row");
      row.type = "button";
      row.setAttribute("aria-label", `Open analysis from ${formatDate(result.ts)}`);
      const main = node("span", undefined, "history-main");
      main.append(node("small", formatDate(result.ts)));
      main.append(node("span", `${result.scores.quality} · ${result.scores.readability} · ${result.scores.concept}`, "history-scores mono"));
      row.append(main);
      row.append(node("span", result.complexity.time, "mono"));
      row.addEventListener("click", () => actions.selectResult(result));
      content.append(row);
    }
  }

  private renderSettings(content: HTMLElement, view: PanelView, actions: UiActions): void {
    const settings = view.settings;
    const section = node("section", undefined, "section");
    section.append(node("h2", "Prompts", "section-title"));
    section.append(this.settingSelect("Toast", ["On", "Snooze 24 h", "Off"], settings.toastMode === "on" ? "On" : settings.toastMode === "off" ? "Off" : "Snooze 24 h", (value) => {
      const toastMode = value === "On" ? "on" : value === "Off" ? "off" : "snoozed";
      actions.updateSettings({ ...settings, toastMode, snoozedUntil: toastMode === "snoozed" ? Date.now() + 86_400_000 : null });
    }));
    section.append(this.settingSelect("Animation", ["Subtle", "Off"], settings.animation === "subtle" ? "Subtle" : "Off", (value) => {
      actions.updateSettings({ ...settings, animation: value.toLowerCase() as UserSettings["animation"] });
    }));
    section.append(this.settingSelect("Low-score threshold", Array.from({ length: 9 }, (_, i) => String(i + 1)), String(settings.threshold), (value) => {
      actions.updateSettings({ ...settings, threshold: Number(value) });
    }));
    section.append(node("p", "Code is never saved in extension storage. It is sent to the configured server and Anthropic only after you click Analyze; Anthropic retention terms apply.", "privacy"));
    content.append(section);

    const data = node("section", undefined, "section");
    data.append(node("h2", "Data", "section-title"));
    data.append(button("Export JSON", actions.exportData, "button ghost"));
    data.append(button("Delete all data", () => {
      const confirm = node("div", undefined, "confirm");
      confirm.append(node("span", "Delete everything?"));
      confirm.append(button("Cancel", () => confirm.remove(), "button ghost small"));
      confirm.append(button("Delete", actions.deleteAll, "button small"));
      data.append(confirm);
    }, "button ghost"));
    content.append(data);
  }

  private settingSelect(
    labelText: string,
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ): HTMLElement {
    const row = node("div", undefined, "setting");
    row.append(node("label", labelText));
    const select = node("select");
    select.setAttribute("aria-label", labelText);
    for (const value of options) {
      const option = node("option", value);
      option.value = value;
      option.selected = value === selected;
      select.append(option);
    }
    select.addEventListener("change", () => onChange(select.value));
    row.append(select);
    return row;
  }
}
