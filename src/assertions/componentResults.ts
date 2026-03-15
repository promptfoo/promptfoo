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
