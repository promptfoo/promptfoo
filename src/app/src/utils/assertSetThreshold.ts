/**
 * Constants and utilities for assert-set threshold handling
 */

/**
 * Threshold constants for assert-set evaluation
 */
export const THRESHOLD = {
  /** Full aggregate score is required */
  ALL: 1,
  /** Half of the aggregate score is required */
  HALF: 0.5,
} as const;

/**
 * Get a human-readable label for an assert-set threshold
 *
 * @param threshold - The threshold value (0-1)
 * @returns Human-readable label describing the threshold requirement
 */
export function getThresholdLabel(threshold: number | undefined): string {
  if (threshold === undefined) {
    return 'All assertions must pass';
  }

  return `Required score: ${Math.round(threshold * 100)}%`;
}

/**
 * Format score as percentage with threshold comparison
 *
 * @param score - The actual score (0-1)
 * @param threshold - Optional threshold to compare against
 * @returns Formatted string like "75% >= 50%"
 */
export function formatScoreThreshold(score: number, threshold?: number): string {
  const scorePercent = Math.round(score * 100);

  if (threshold !== undefined) {
    const thresholdPercent = Math.round(threshold * 100);
    return `${scorePercent}% ${score >= threshold ? '≥' : '<'} ${thresholdPercent}%`;
  }

  return `${scorePercent}%`;
}
