import type { GradingResult } from '../types/index';

export function collectAssertedComponentResults(
  componentResults: GradingResult[] | undefined,
): GradingResult[] {
  return (componentResults || []).flatMap((result) => {
    const nestedResults = collectAssertedComponentResults(result.componentResults);
    return result.assertion ? [result, ...nestedResults] : nestedResults;
  });
}
