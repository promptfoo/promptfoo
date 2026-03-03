import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import type { EvaluateTableOutput } from '@promptfoo/types';

/**
 * Creates a deterministic hash from a list of variable names.
 * Used to group evals with the same "schema" for column visibility persistence.
 * Evals with the same set of variables will share column visibility preferences.
 *
 * @param varNames - Array of variable names from the eval
 * @returns A string hash representing the schema
 */
export function hashVarSchema(varNames: string[]): string {
  // Sort to ensure consistent hash regardless of original order
  const sorted = [...varNames].sort();
  // Use JSON.stringify for robust serialization that handles any characters
  return JSON.stringify(sorted);
}

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
