/**
 * Calculates pass^N (pass-to-the-power-of-N) metric for evaluating consistency
 * across repeated test runs.
 *
 * pass^N = (per_test_pass_rate)^N
 *
 * This measures the probability that ALL N independent attempts would succeed,
 * which is critical for production reliability assessment.
 */

export interface PassPowerGroup {
  testIdx: number;
  promptIdx: number;
  varsKey: string;
  passRate: number;
  passPowerN: number;
  totalRepetitions: number;
  successes: number;
}

export interface PassPowerResult {
  n: number;
  /** Overall pass^N score (0-100), averaged across all test groups */
  overallScore: number;
  groups: PassPowerGroup[];
}

/**
 * Creates a stable grouping key from vars by sorting keys alphabetically.
 * This ensures consistent grouping regardless of object key insertion order.
 */
function stableVarsKey(vars: Record<string, unknown>): string {
  const sortedKeys = Object.keys(vars).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sorted[key] = vars[key];
  }
  return JSON.stringify(sorted);
}

interface PassPowerInput {
  promptIdx: number;
  testIdx: number;
  vars?: Record<string, unknown>;
  testCase?: {
    vars?: Record<string, unknown>;
  };
  success: boolean;
}

export function calculatePassPowerOfN(
  results: Array<{
    promptIdx: number;
    testIdx: number;
    vars: Record<string, unknown>;
    success: boolean;
  }>,
  n: number,
): PassPowerResult {
  if (n <= 0) {
    return { n, overallScore: 100, groups: [] };
  }

  // Group results by promptIdx + vars content. testIdx is excluded because the
  // evaluator assigns a unique testIdx to each repetition, so including it
  // would create one group per repetition and reduce pass^N to raw pass rate.
  const groups = new Map<
    string,
    { testIdx: number; promptIdx: number; varsKey: string; total: number; passed: number }
  >();

  for (const result of results) {
    const varsKey = stableVarsKey(result.vars);
    const groupKey = `${result.promptIdx}:${varsKey}`;

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        testIdx: result.testIdx,
        promptIdx: result.promptIdx,
        varsKey,
        total: 0,
        passed: 0,
      };
      groups.set(groupKey, group);
    }

    group.total++;
    if (result.success) {
      group.passed++;
    }
  }

  const groupResults: PassPowerGroup[] = [];
  for (const group of groups.values()) {
    const passRate = group.total > 0 ? group.passed / group.total : 0;
    const passPowerN = Math.pow(passRate, n);
    groupResults.push({
      testIdx: group.testIdx,
      promptIdx: group.promptIdx,
      varsKey: group.varsKey,
      passRate,
      passPowerN,
      totalRepetitions: group.total,
      successes: group.passed,
    });
  }

  const overallScore =
    groupResults.length > 0
      ? (groupResults.reduce((sum, g) => sum + g.passPowerN, 0) / groupResults.length) * 100
      : 100;

  return { n, overallScore, groups: groupResults };
}

export function calculatePassPowerOfNFromResults(
  results: PassPowerInput[],
  n: number,
): PassPowerResult {
  return calculatePassPowerOfN(
    results.map((result) => ({
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      vars: result.testCase?.vars || result.vars || {},
      success: result.success,
    })),
    n,
  );
}
