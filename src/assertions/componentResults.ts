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

// Metric-only results (thresholdless cost/latency) record raw named metrics and must
// not contribute to assertPass/assertFail totals.
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
