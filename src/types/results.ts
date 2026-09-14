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
