/**
 * Constants and utilities for assert-set threshold handling
 */

/**
 * Threshold constants for assert-set evaluation
 */
export const THRESHOLD = {
  /** All children must pass */
  ALL: 1,
  /** At least half must pass (Either/Or) */
  HALF: 0.5,
} as const;

/**
 * Get a human-readable label for an assert-set threshold
 *
 * @param threshold - The threshold value (0-1)
 * @param childCount - Optional number of children for "X/Y" display
 * @returns Human-readable label describing the threshold requirement
 */
export function getThresholdLabel(threshold: number | undefined, childCount?: number): string {
  if (threshold === undefined || threshold === THRESHOLD.ALL) {
    return 'ALL must pass';
  }

  if (threshold === THRESHOLD.HALF) {
    return 'Either/Or';
  }

  if (threshold > 0 && threshold < THRESHOLD.HALF) {
    return 'At least one';
  }

  if (threshold > THRESHOLD.HALF && threshold < THRESHOLD.ALL) {
    if (childCount) {
      const requiredCount = Math.ceil(threshold * childCount);
      return `Most must pass (${requiredCount}/${childCount})`;
    }
    return 'Most must pass';
  }

  return '';
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
