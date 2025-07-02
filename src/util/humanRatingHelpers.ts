import type { GradingResult } from '../types';

/**
 * Gets the human rating from a grading result
 * @param gradingResult - The grading result to extract human rating from
 * @returns The human rating component result or null if not found
 */
export function getHumanRating(
  gradingResult: GradingResult | null | undefined,
): GradingResult | null {
  if (!gradingResult?.componentResults || !Array.isArray(gradingResult.componentResults)) {
    return null;
  }

  const humanRatings = gradingResult.componentResults.filter(
    (result) => result?.assertion?.type === 'human',
  );

  // Return the last human rating (most recent) or null
  return humanRatings[humanRatings.length - 1] || null;
}
