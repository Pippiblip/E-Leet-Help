declare const __FLASK_BASE_URL__: string;

export const FLASK_BASE_URL = __FLASK_BASE_URL__;
export const MAX_CODE_CHARS = 20_000;
export const MAX_MESSAGE_BYTES = 48 * 1024;
export const ANALYZE_TIMEOUT_MS = 25_000;
export const SUBMISSION_DETAILS_TIMEOUT_MS = 10_000;
export const RUBRIC_VERSION = "v1";

export const MESSAGE_ANALYZE = "ANALYZE";
export const PAGE_MESSAGE_SOURCE = "lc-analyzer";
export const PAGE_MESSAGE_VERSION = 1;

export const ANALYSIS_STORAGE_PREFIX = "results:";
export const SEEN_IDS_STORAGE_KEY = "seen_ids";
export const INSTALL_ID_STORAGE_KEY = "install_id";
export const SETTINGS_STORAGE_KEY = "settings";
