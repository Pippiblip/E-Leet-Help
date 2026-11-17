export interface Verdict {
  status_code: 10;
  status_msg?: string;
  status_runtime?: string;
  status_memory?: string;
  runtime_percentile?: number;
  memory_percentile?: number;
  total_correct?: number;
  total_testcases?: number;
}

export interface AcceptedPayload extends Partial<Omit<Verdict, "status_code">> {
  submission_id: string;
  slug: string;
  status_code: 10;
  status_msg?: string;
  lang?: string;
  pretty_lang?: string;
  question_id?: string | number;
  status_runtime?: string;
  status_memory?: string;
  runtime_percentile?: number;
  memory_percentile?: number;
  total_correct?: number;
  total_testcases?: number;
}

export interface SubmissionDetails {
  code: string;
  statusCode?: number;
  lang: string;
  langVerbose: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  questionId: string;
  tags: string[];
}

export interface Scores {
  quality: number;
  readability: number;
  concept: number;
}

export interface Complexity {
  time: string;
  space: string;
}

export interface SuggestedApproach extends Complexity {
  approach: string;
}

export interface AnalyzeHistoryItem {
  submission_id: string;
  scores: Scores;
  time_complexity: string;
  space_complexity: string;
  rubric_version: string;
}

export interface AnalyzeBody {
  submission_id: string;
  slug: string;
  title: string;
  difficulty: string;
  topic_tags: string[];
  lang: string;
  code: string;
  verdict: Omit<Verdict, "status_code" | "status_msg">;
  history: AnalyzeHistoryItem[];
}

export interface AnalyzeRequest extends AnalyzeBody {
  install_id: string;
}

export interface AnalyzeResponse {
  rubric_version: string;
  scores: Scores;
  complexity: Complexity;
  suggested: SuggestedApproach;
  concepts: string[];
  hint: string | null;
}

export interface StoredResult extends AnalyzeResponse {
  slug: string;
  title: string;
  lang: string;
  difficulty: string;
  submission_id: string;
  ts: number;
  verdict: Verdict;
}

export interface RuntimeAnalyzeMessage {
  type: "ANALYZE";
  body: AnalyzeBody;
}

export type RuntimeAnalyzeResponse =
  | { ok: true; data: AnalyzeResponse }
  | { ok: false; error: { code: string; message: string } };
