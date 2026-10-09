/** Percentage of tests that failed grading; zero when there are no tests. */
export function calculateAttackSuccessRate(testCount: number, failCount: number): number {
  return testCount > 0 ? (failCount / testCount) * 100 : 0;
}
