export const ResultFailureReason = {
  // The test passed, or we don't know exactly why the test case failed.
  NONE: 0,
  // The test case failed because an assertion rejected it.
  ASSERT: 1,
  // Test case failed due to some other error.
  ERROR: 2,
} as const;
export type ResultFailureReason = (typeof ResultFailureReason)[keyof typeof ResultFailureReason];

const validResultFailureReasons = new Set<number>(Object.values(ResultFailureReason));

export function isResultFailureReason(value: number): value is ResultFailureReason {
  return validResultFailureReasons.has(value);
}

/**
 * Component results that participate in pass/fail: everything except
 * metric-only assertions, which only emit named scores. Use this wherever
 * assertion outcomes are aggregated into pass/fail stats or reasons. Only
 * boolean true marks a result as metric-only, including for legacy stored data.
 */
export function countedComponentResults<
  T extends {
    pass: boolean;
    score: number;
    reason: string;
    assertion?: { type?: string; metricOnly?: boolean };
    metadata?: { metricOnly?: boolean; [key: string]: unknown };
  },
>(componentResults: (T | null | undefined)[] | null | undefined): T[] {
  return (componentResults ?? []).filter(
    (result): result is T =>
      result != null &&
      result.assertion?.metricOnly !== true &&
      result.metadata?.metricOnly !== true,
  );
}
