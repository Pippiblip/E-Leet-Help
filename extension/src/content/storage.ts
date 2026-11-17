import {
  ANALYSIS_STORAGE_PREFIX,
  SEEN_IDS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from "../shared/constants";
import type { AnalyzeResponse, StoredResult } from "../shared/types";

export interface UserSettings {
  toastMode: "on" | "snoozed" | "off";
  snoozedUntil: number | null;
  animation: "subtle" | "off";
  threshold: number;
}

export interface ReviewItem {
  submission_id: string;
  slug: string;
  title: string;
  due_at: number;
  step: number;
  lowest_score: number;
  hint: string | null;
}

const REVIEWS_STORAGE_KEY = "reviews";
const MAX_RESULTS_PER_SLUG = 20;
const MAX_SEEN_IDS = 200;
const DEFAULT_SETTINGS: UserSettings = {
  toastMode: "on",
  snoozedUntil: null,
  animation: "subtle",
  threshold: 5,
};

export async function getSettings(): Promise<UserSettings> {
  const values = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const saved = values[SETTINGS_STORAGE_KEY] as Partial<UserSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export async function getResults(slug: string): Promise<StoredResult[]> {
  const values = await chrome.storage.local.get(`${ANALYSIS_STORAGE_PREFIX}${slug}`);
  const result = values[`${ANALYSIS_STORAGE_PREFIX}${slug}`];
  return Array.isArray(result) ? result as StoredResult[] : [];
}

export async function getAllStoredResults(): Promise<StoredResult[]> {
  const values = await chrome.storage.local.get(null);
  return Object.entries(values)
    .filter(([key, value]) => key.startsWith(ANALYSIS_STORAGE_PREFIX) && Array.isArray(value))
    .flatMap(([, value]) => value as StoredResult[]);
}

export async function getCachedResult(slug: string, submissionId: string): Promise<StoredResult | null> {
  const results = await getResults(slug);
  return results.find((result) => result.submission_id === submissionId) || null;
}

export async function saveResult(
  slug: string,
  submissionId: string,
  response: AnalyzeResponse,
  verdict: StoredResult["verdict"],
  metadata: Pick<StoredResult, "title" | "lang" | "difficulty">,
): Promise<StoredResult> {
  const record: StoredResult = {
    ...response,
    slug,
    ...metadata,
    submission_id: submissionId,
    ts: Date.now(),
    verdict,
  };
  const results = await getResults(slug);
  const next = [...results.filter((result) => result.submission_id !== submissionId), record]
    .slice(-MAX_RESULTS_PER_SLUG);
  await chrome.storage.local.set({ [`${ANALYSIS_STORAGE_PREFIX}${slug}`]: next });
  return record;
}

export async function hasSeenId(id: string): Promise<boolean> {
  const values = await chrome.storage.local.get(SEEN_IDS_STORAGE_KEY);
  const ids = values[SEEN_IDS_STORAGE_KEY];
  return Array.isArray(ids) && ids.includes(id);
}

export async function addSeenId(id: string): Promise<void> {
  const values = await chrome.storage.local.get(SEEN_IDS_STORAGE_KEY);
  const ids = Array.isArray(values[SEEN_IDS_STORAGE_KEY])
    ? values[SEEN_IDS_STORAGE_KEY] as string[]
    : [];
  await chrome.storage.local.set({
    [SEEN_IDS_STORAGE_KEY]: [...ids.filter((savedId) => savedId !== id), id].slice(-MAX_SEEN_IDS),
  });
}

export async function getReviews(): Promise<ReviewItem[]> {
  const values = await chrome.storage.local.get(REVIEWS_STORAGE_KEY);
  const reviews = values[REVIEWS_STORAGE_KEY];
  return Array.isArray(reviews) ? reviews as ReviewItem[] : [];
}

export async function updateReview(
  slug: string,
  title: string,
  record: StoredResult,
  threshold: number,
): Promise<void> {
  const reviews = await getReviews();
  const previous = reviews.find((review) => review.slug === slug);
  const scores = Object.values(record.scores);
  const lowestScore = Math.min(...scores);
  const clearsThreshold = lowestScore > threshold;
  let next = reviews.filter((review) => review.slug !== slug);

  if (clearsThreshold) {
    if (previous && previous.step < 3) {
      const step = previous.step + 1;
      const days = [1, 3, 7, 21][step];
      next = [...next, {
        ...previous,
        submission_id: record.submission_id,
        due_at: Date.now() + days * 24 * 60 * 60 * 1000,
        step,
        lowest_score: lowestScore,
        hint: record.hint,
      }];
    }
  } else {
    next = [...next, {
      submission_id: record.submission_id,
      slug,
      title,
      due_at: Date.now() + 24 * 60 * 60 * 1000,
      step: 0,
      lowest_score: lowestScore,
      hint: record.hint,
    }];
  }
  await chrome.storage.local.set({ [REVIEWS_STORAGE_KEY]: next });
}

export async function deleteAllData(): Promise<void> {
  const values = await chrome.storage.local.get(null);
  const dataKeys = Object.keys(values).filter((key) => key !== "install_id");
  await chrome.storage.local.remove(dataKeys);
  await chrome.storage.local.set({ [SEEN_IDS_STORAGE_KEY]: [] });
}
