import type { GradingResult } from '../types/index';

function collectComponentResults(
  componentResults: GradingResult[] | undefined,
  includeAnonymousLeaves: boolean,
): GradingResult[] {
  return (componentResults || []).flatMap((result) => {
    const nestedResults = collectComponentResults(result.componentResults, includeAnonymousLeaves);

    if (result.assertion) {
      return [result, ...nestedResults];
    }

    if (nestedResults.length > 0) {
      return nestedResults;
    }

    return includeAnonymousLeaves ? [result] : [];
  });
}

export function collectAssertedComponentResults(
  componentResults: GradingResult[] | undefined,
): GradingResult[] {
  return collectComponentResults(componentResults, false);
}

export function collectCountableComponentResults(
  componentResults: GradingResult[] | undefined,
): GradingResult[] {
  return collectComponentResults(componentResults, true);
}

/**
 * Counts countable component results that contribute to the assertPass/assertFail
 * totals, skipping metric-only results (e.g. thresholdless cost/latency) that only
 * record raw named metrics.
 */
export function countAssertionPassFail(componentResults: GradingResult[] | undefined): {
  passCount: number;
  failCount: number;
} {
  let passCount = 0;
  let failCount = 0;
  for (const result of collectCountableComponentResults(componentResults)) {
    if (result.metadata?.isMetricOnly) {
      continue;
    }
    if (result.pass) {
      passCount++;
    } else {
      failCount++;
    }
  }
  return { passCount, failCount };
}
