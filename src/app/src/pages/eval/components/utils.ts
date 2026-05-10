import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import type { EvaluateTableOutput, PromptMetrics } from '@promptfoo/types';

const EVAL_OUTPUT_PROMPT_HASH_PATTERN = /^#details-row-(\d+)-prompt-(\d+)$/;

export interface EvalOutputPromptHashTarget {
  rowIndex: number;
  promptIndex: number;
}

export interface EvalUrlParts {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Builds the URL hash used for deep-linking to an eval output details dialog.
 * Public URLs use one-based row/prompt numbers while the UI uses zero-based indexes internally.
 */
export function buildEvalOutputPromptHash(rowIndex: number, promptIndex: number): string {
  return `#details-row-${rowIndex + 1}-prompt-${promptIndex + 1}`;
}

/**
 * Parses an eval output details hash into zero-based row/prompt indexes.
 */
export function parseEvalOutputPromptHash(hash: string): EvalOutputPromptHashTarget | null {
  const match = hash.match(EVAL_OUTPUT_PROMPT_HASH_PATTERN);
  if (!match) {
    return null;
  }

  const rowNumber = Number.parseInt(match[1], 10);
  const promptNumber = Number.parseInt(match[2], 10);

  if (rowNumber < 1 || promptNumber < 1) {
    return null;
  }

  return {
    rowIndex: rowNumber - 1,
    promptIndex: promptNumber - 1,
  };
}

/**
 * Builds router location parts after mutating search params while preserving the current hash.
 */
export function buildEvalUrlWithSearchParams(
  location: EvalUrlParts,
  mutateSearchParams: (params: URLSearchParams) => void,
): EvalUrlParts {
  const nextSearchParams = new URLSearchParams(location.search);
  mutateSearchParams(nextSearchParams);
  const nextSearch = nextSearchParams.toString();

  return {
    pathname: location.pathname,
    search: nextSearch ? `?${nextSearch}` : '',
    hash: location.hash,
  };
}

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

type NamedMetricTotalsSource = Pick<PromptMetrics, 'namedScoresCount' | 'namedScoreWeights'>;

export function getNamedMetricTotal(
  metrics: NamedMetricTotalsSource | null | undefined,
  metric: string,
): number {
  return metrics?.namedScoreWeights?.[metric] ?? metrics?.namedScoresCount?.[metric] ?? 0;
}

export function getNamedMetricTotals(
  metrics: NamedMetricTotalsSource | null | undefined,
): Record<string, number> | undefined {
  if (!metrics?.namedScoresCount && !metrics?.namedScoreWeights) {
    return undefined;
  }

  return {
    ...(metrics.namedScoresCount ?? {}),
    ...(metrics.namedScoreWeights ?? {}),
  };
}
