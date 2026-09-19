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

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (typeof input === 'bigint') {
      return input.toString();
    }
    if (typeof input === 'function') {
      return `[Function ${(input as { name?: string }).name || 'anonymous'}]`;
    }
    if (input === undefined) {
      return '[undefined]';
    }
    if (input == null || typeof input !== 'object') {
      return input;
    }
    if (seen.has(input)) {
      return '[Circular]';
    }

    seen.add(input);
    if (Array.isArray(input)) {
      const normalizedArray = input.map(normalize);
      seen.delete(input);
      return normalizedArray;
    }

    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = normalize((input as Record<string, unknown>)[key]);
    }
    seen.delete(input);
    return sorted;
  };

  return JSON.stringify(normalize(value)) ?? '[undefined]';
}

function stableVarsKey(vars: Record<string, unknown>): string {
  return stableStringify(vars);
}

function stableTestCaseKey(
  testCase: (Record<string, unknown> & { vars?: Record<string, unknown> }) | undefined,
  vars: Record<string, unknown>,
): string {
  if (testCase == null) {
    return stableStringify({ vars });
  }

  return stableStringify({ ...testCase, vars: testCase.vars || vars });
}

interface PassPowerInput {
  promptIdx: number;
  testIdx: number;
  vars?: Record<string, unknown>;
  testCase?: Record<string, unknown> & {
    vars?: Record<string, unknown>;
  };
  success: boolean;
}

export function calculatePassPowerOfN(
  results: Array<{
    promptIdx: number;
    testIdx: number;
    vars: Record<string, unknown>;
    testCaseKey?: string;
    success: boolean;
  }>,
  n: number,
): PassPowerResult {
  if (n <= 0) {
    return { n, overallScore: 100, groups: [] };
  }

  // Group results by prompt and stable test-case identity. testIdx is excluded
  // because the evaluator assigns a unique testIdx to each repetition, so
  // including it would create one group per repetition and reduce pass^N to raw
  // pass rate.
  const groups = new Map<
    string,
    { testIdx: number; promptIdx: number; varsKey: string; total: number; passed: number }
  >();

  for (const result of results) {
    const varsKey = stableVarsKey(result.vars);
    const groupKey = `${result.promptIdx}:${result.testCaseKey || varsKey}`;

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
    results.map((result) => {
      const vars = result.testCase?.vars || result.vars || {};
      return {
        promptIdx: result.promptIdx,
        testIdx: result.testIdx,
        vars,
        testCaseKey: stableTestCaseKey(result.testCase, vars),
        success: result.success,
      };
    }),
    n,
  );
}
