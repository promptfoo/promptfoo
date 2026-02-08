import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import type { EvaluateTableOutput } from '@promptfoo/types';

/**
 * Checks if an output has been manually rated by a user.
 * @param output - The evaluation output to check
 * @returns true if the output has a human rating in componentResults
 */
export function hasHumanRating(output: EvaluateTableOutput | null | undefined): boolean {
  if (!output?.gradingResult?.componentResults) {
    return false;
  }
  return output.gradingResult.componentResults.some(
    (result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE,
  );
}

/**
 * Retrieves the human rating componentResult if one exists.
 * @param output - The evaluation output to search
 * @returns The human rating componentResult or undefined if none exists
 */
export function getHumanRating(output: EvaluateTableOutput | null | undefined) {
  if (!output?.gradingResult?.componentResults) {
    return undefined;
  }
  return output.gradingResult.componentResults.find(
    (result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE,
  );
}
