/**
 * Shared types for web page creation and tracking APIs.
 * Used by both the indirect-web-pwn strategy and provider.
 */

/**
 * Response from create-web-page task API.
 */
export interface CreateWebPageResponse {
  uuid: string;
  path: string;
  fullUrl: string;
  embeddingLocation?: string;
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
}

/**
 * Response from get-web-page-tracking task API.
 */
export interface WebPageTrackingResponse {
  uuid: string;
  wasFetched: boolean;
  fetchCount: number;
  wasExfiltrated: boolean;
  exfilCount: number;
  exfilRecords: Array<{
    timestamp: string;
    ip: string;
    userAgent: string;
    queryParams: Record<string, string>;
  }>;
  createdAt: string;
  testCaseId: string;
}
