/**
 * Shared types for web page creation and tracking APIs.
 * Used by both the indirect-web-pwn strategy and provider.
 */

/**
 * Single exfiltration record with request metadata.
 */
export interface ExfilRecord {
  timestamp: string;
  ip: string;
  userAgent: string;
  queryParams: Record<string, string>;
}

/**
 * Exfiltration tracking data (wasExfiltrated, exfilCount, exfilRecords).
 * Used by graders and providers to track data exfiltration attempts.
 */
export interface ExfilData {
  wasExfiltrated: boolean;
  exfilCount: number;
  exfilRecords: ExfilRecord[];
}

/**
 * Response from create-web-page task API.
 */
export interface CreateWebPageResponse {
  uuid: string;
  path: string;
  fullUrl: string;
  embeddingLocation?: string;
  /** LLM-generated fetch prompt asking the AI to visit the URL */
  fetchPrompt?: string;
}

/**
 * Response from update-web-page task API.
 */
export interface UpdateWebPageResponse {
  uuid: string;
  updated: boolean;
  updatedAt: string;
  embeddingLocation?: string;
  updateCount?: number;
  /** LLM-generated fetch prompt asking the AI to visit the URL */
  fetchPrompt?: string;
}

/**
 * Response from get-web-page-tracking task API.
 */
export interface WebPageTrackingResponse extends ExfilData {
  uuid: string;
  wasFetched: boolean;
  fetchCount: number;
  createdAt: string;
  testCaseId: string;
}
