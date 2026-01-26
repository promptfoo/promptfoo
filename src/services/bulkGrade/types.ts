import type { EvalResultsFilterMode, GradingResult } from '../../types/index';

/**
 * Request to bulk rate multiple eval results with a pass/fail override.
 */
export interface BulkRatingRequest {
  /**
   * Whether the selected results should pass or fail.
   */
  pass: boolean;

  /**
   * The reason for the rating, applied to all selected results.
   * Empty strings are allowed - the pass/fail status itself may be
   * sufficient context for bulk operations.
   */
  reason: string;

  /**
   * Filter mode to select which results to rate.
   */
  filterMode: EvalResultsFilterMode;

  /**
   * Additional custom filters (same format as the UI filter JSON).
   */
  filters?: string[];

  /**
   * Optional search query to further filter results.
   */
  searchQuery?: string;

  /**
   * Confirmation flag required when rating 50+ results.
   */
  confirmBulk?: boolean;
}

/**
 * Response from a bulk rating operation.
 */
export interface BulkRatingResponse {
  /**
   * Whether the operation was successful.
   */
  success: boolean;

  /**
   * Total number of results that matched the filter.
   */
  matched: number;

  /**
   * Number of results that were successfully updated.
   */
  updated: number;

  /**
   * Number of results that were skipped (e.g., already had the same rating).
   */
  skipped: number;

  /**
   * Error message if the operation failed.
   */
  error?: string;
}

/**
 * Tracks metric changes (deltas) during bulk processing.
 * Used to apply a single atomic update at the end.
 */
export interface MetricDeltas {
  /**
   * Delta for test pass count (positive = more passes).
   */
  testPassDelta: number;

  /**
   * Delta for test fail count (positive = more failures).
   */
  testFailDelta: number;

  /**
   * Delta for assertion pass count.
   */
  assertPassDelta: number;

  /**
   * Delta for assertion fail count.
   */
  assertFailDelta: number;

  /**
   * Delta for total score.
   */
  scoreDelta: number;
}

/**
 * Per-prompt metric deltas, keyed by promptIdx.
 */
export type PromptMetricDeltas = Map<number, MetricDeltas>;

/**
 * Internal representation of a result being processed for bulk rating.
 */
export interface BulkRatingResultInfo {
  id: string;
  promptIdx: number;
  testIdx: number;
  currentSuccess: boolean;
  currentScore: number;
  hasExistingManualOverride: boolean;
  gradingResult: GradingResult | null;
}

/**
 * Response from the bulk rating preview endpoint.
 */
export interface BulkRatingPreviewResponse {
  /**
   * Number of results matching the filter.
   */
  count: number;
}

/**
 * Threshold constants for bulk operations.
 * These are shared between frontend and backend.
 */
export const BULK_RATING_CONSTANTS = {
  /**
   * Number of results that requires confirmBulk flag.
   * When a bulk operation affects this many or more results,
   * the user must explicitly confirm the operation.
   */
  CONFIRMATION_THRESHOLD: 50,

  /**
   * Maximum results to process in a single database batch.
   * Used to avoid SQLite statement size limits (~1MB).
   */
  BATCH_SIZE: 50,

  /**
   * Maximum length of the reason text.
   */
  MAX_REASON_LENGTH: 10000,

  /**
   * Lock TTL in milliseconds (5 minutes).
   * Locks older than this are automatically released.
   */
  LOCK_TTL_MS: 5 * 60 * 1000,
} as const;
