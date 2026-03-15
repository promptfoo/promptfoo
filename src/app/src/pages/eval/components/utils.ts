import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import type { EvaluateTableOutput, UnifiedConfig } from '@promptfoo/types';

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
 * Computes default hidden variable names from results table visibility config.
 *
 * Precedence:
 * 1) defaultVisibleVars (allowlist): any var not listed will be hidden by default.
 * 2) defaultHiddenVars (denylist): listed vars will be hidden by default.
 * 3) no config: no vars hidden by default.
 */
export function getDefaultHiddenVarNames(
  varNames: string[],
  resultsTableConfig: Partial<UnifiedConfig>['resultsTable'] | undefined,
): string[] {
  const defaultVisibleVars = resultsTableConfig?.defaultVisibleVars;
  if (defaultVisibleVars && defaultVisibleVars.length > 0) {
    const visibleSet = new Set(defaultVisibleVars);
    return varNames.filter((name) => !visibleSet.has(name));
  }

  const defaultHiddenVars = resultsTableConfig?.defaultHiddenVars;
  if (defaultHiddenVars && defaultHiddenVars.length > 0) {
    const hiddenSet = new Set(defaultHiddenVars);
    return varNames.filter((name) => hiddenSet.has(name));
  }

  return [];
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
