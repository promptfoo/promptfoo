import logger from '../../logger';
import Eval from '../../models/eval';
import { deduplicateTestCases, extractRuntimeVars, filterRuntimeVars } from '../../util/comparison';
import { readOutput, resultIsForTestCase } from '../../util/index';

import type { EvaluateResult, TestCase, TestSuite } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;

/**
 * Merges defaultTest.vars into a test case's vars for comparison purposes.
 * This mirrors what prepareTests does in the evaluator, ensuring that when
 * we compare stored results (which have merged vars) with fresh test cases
 * (which don't), the vars will match.
 */
function mergeDefaultVars(test: TestCase, defaultTest: TestSuite['defaultTest']): TestCase {
  if (!defaultTest || typeof defaultTest === 'string') {
    return test;
  }
  return {
    ...test,
    vars: {
      ...defaultTest.vars,
      ...test.vars,
    },
  };
}

/**
 * Loads evaluation results from either a JSON file path or an eval ID.
 */
async function loadResults(pathOrId: string): Promise<{ results: EvaluateResult[] } | null> {
  if (pathOrId.endsWith('.json')) {
    const output = await readOutput(pathOrId);
    return output.results;
  }

  const eval_ = await Eval.findById(pathOrId);
  if (!eval_) {
    logger.warn(`[filterTestsByResults] Evaluation not found: ${pathOrId}`);
    return null;
  }

  const summary = await eval_.toEvaluateSummary();
  if (!('results' in summary)) {
    logger.debug('[filterTestsByResults] No results in evaluation summary');
    return null;
  }

  return { results: summary.results };
}

/**
 * Checks whether the testSuite has default vars that would be merged into test cases.
 */
function hasDefaultVars(testSuite: TestSuite): boolean {
  const defaultTest = testSuite.defaultTest;
  return (
    defaultTest !== undefined &&
    typeof defaultTest !== 'string' &&
    defaultTest.vars !== undefined &&
    Object.keys(defaultTest.vars).length > 0
  );
}

/**
 * Finds a matching result for a test case, preferring results that have runtime vars.
 */
function findMatchingResult(
  test: TestCase,
  filteredResults: EvaluateResult[],
): EvaluateResult | undefined {
  // Prefer results with runtime vars first
  const withRuntimeVars = filteredResults.find(
    (result) => resultIsForTestCase(result, test) && extractRuntimeVars(result.vars) !== undefined,
  );
  if (withRuntimeVars) {
    return withRuntimeVars;
  }

  // Fallback: any matching result
  return filteredResults.find((result) => resultIsForTestCase(result, test));
}

/**
 * Attempts to find a matching result for a given test case.
 * Tries with merged defaults first, then without (for backward compat).
 */
function matchTestToResult(
  test: TestCase,
  testSuite: TestSuite,
  filteredResults: EvaluateResult[],
): EvaluateResult | undefined {
  const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);

  // Try matching with merged defaults first (new results)
  const matchedWithDefaults = findMatchingResult(testWithDefaults, filteredResults);
  if (matchedWithDefaults) {
    return matchedWithDefaults;
  }

  // Fallback: try matching without defaults (old results that don't have defaults merged)
  if (!hasDefaultVars(testSuite)) {
    return undefined;
  }

  return findMatchingResult(test, filteredResults);
}

/**
 * Builds a test case from a matched result, restoring any runtime variables.
 */
function buildTestWithRuntimeVars(test: TestCase, matchedResult: EvaluateResult): TestCase {
  const runtimeVars = extractRuntimeVars(matchedResult.vars);
  if (!runtimeVars) {
    logger.debug('[filterTestsByResults] Matched test has no runtime vars to restore');
    return test;
  }

  logger.debug('[filterTestsByResults] Restored runtime vars for test', {
    varKeys: Object.keys(runtimeVars),
  });

  return {
    ...test,
    vars: {
      ...test.vars,
      ...runtimeVars,
    },
  };
}

/**
 * Matches test suite tests against filtered results.
 * Returns a list of matched tests with runtime vars restored.
 */
function matchConfigTests(testSuite: TestSuite, filteredResults: EvaluateResult[]): Tests {
  const matchedTests: Tests = [];

  for (const test of testSuite.tests!) {
    const matchedResult = matchTestToResult(test, testSuite, filteredResults);
    if (matchedResult) {
      matchedTests.push(buildTestWithRuntimeVars(test, matchedResult));
    }
  }

  return matchedTests;
}

/**
 * Builds a set of result keys that matched config tests (for deduplication in extraction).
 */
function buildMatchedResultKeys(
  matchedTests: Tests,
  testSuite: TestSuite,
  filteredResults: EvaluateResult[],
): Set<string> {
  const matchedResultKeys = new Set<string>();

  for (const result of filteredResults) {
    for (const test of matchedTests) {
      const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);
      if (resultIsForTestCase(result, testWithDefaults)) {
        matchedResultKeys.add(JSON.stringify(filterRuntimeVars(result.vars)));
        break;
      }
    }
  }

  return matchedResultKeys;
}

/**
 * Extracts tests from results that didn't match any config test.
 * This captures runtime-generated tests (e.g., from remote plugins).
 */
function extractRuntimeGeneratedTests(
  filteredResults: EvaluateResult[],
  matchedResultKeys: Set<string>,
  extractedTests: TestCase[],
): void {
  for (const result of filteredResults) {
    const resultKey = JSON.stringify(filterRuntimeVars(result.vars));

    // Skip if this result already matched a config test
    if (matchedResultKeys.has(resultKey)) {
      continue;
    }

    // Skip if no testCase data available
    if (!result.testCase) {
      logger.debug('[filterTestsByResults] Skipping result without testCase data for extraction');
      continue;
    }

    // Skip if we already extracted a test with these vars (dedup within extraction)
    if (extractedTests.some((t) => JSON.stringify(filterRuntimeVars(t.vars)) === resultKey)) {
      continue;
    }

    // Extract test case, filtering runtime vars and omitting provider (security)
    extractedTests.push({
      description: result.testCase.description,
      vars: filterRuntimeVars(result.testCase.vars) || {},
      assert: result.testCase.assert,
      metadata: result.testCase.metadata,
      options: result.testCase.options,
      // Intentionally omit: provider (security - may contain stale credentials)
    });
  }
}

/**
 * Logs warnings/debug messages about unmatched results.
 */
function logMatchingStats(
  matchedTests: Tests,
  extractedTests: TestCase[],
  filteredResults: EvaluateResult[],
  uniqueVarsInResults: Set<string>,
): void {
  if (matchedTests.length === 0 && extractedTests.length === 0 && filteredResults.length > 0) {
    logger.warn(
      `[filterTestsByResults] No tests matched ${filteredResults.length} filtered results. ` +
        'This may indicate a vars or provider mismatch between stored results and current test suite. ' +
        'Use LOG_LEVEL=debug for detailed matching info.',
    );
    return;
  }

  if (matchedTests.length + extractedTests.length < uniqueVarsInResults.size) {
    logger.debug(
      `[filterTestsByResults] Note: ${uniqueVarsInResults.size - matchedTests.length - extractedTests.length} unique test cases in results ` +
        'did not match any test in the current test suite and could not be extracted. ' +
        'This may indicate results without testCase data.',
    );
  }
}

/**
 * Filters tests based on previous evaluation results
 * @param testSuite - Test suite to filter
 * @param pathOrId - JSON results file path or eval ID
 * @param filterFn - Predicate to determine which results to include
 * @returns Filtered array of tests
 */
export async function filterTestsByResults(
  testSuite: TestSuite,
  pathOrId: string,
  filterFn: ResultFilterFn,
): Promise<Tests> {
  if (!testSuite.tests) {
    logger.debug('[filterTestsByResults] No tests in test suite');
    return [];
  }

  logger.debug(`[filterTestsByResults] Loading results from: ${pathOrId}`);

  let results: { results: EvaluateResult[] };
  try {
    const loaded = await loadResults(pathOrId);
    if (!loaded) {
      return [];
    }
    results = loaded;
  } catch (error) {
    logger.warn(`[filterTestsByResults] Error loading results: ${error}`);
    return [];
  }

  const filteredResults = results.results.filter(filterFn);
  logger.debug(
    `[filterTestsByResults] Found ${filteredResults.length} matching results out of ${results.results.length} total`,
  );

  if (filteredResults.length === 0) {
    return [];
  }

  // Log unique test cases in filtered results for debugging
  const uniqueVarsInResults = new Set(
    filteredResults.map((r) => JSON.stringify(filterRuntimeVars(r.vars))),
  );
  logger.debug(
    `[filterTestsByResults] ${uniqueVarsInResults.size} unique test cases (by vars) in filtered results`,
  );

  // Match tests against filtered results and restore runtime vars.
  // We try two matching strategies:
  // 1. First, try with defaultTest.vars merged (for new results where defaults are merged)
  // 2. Fallback: try without merging defaults (for old results that don't have defaults merged)
  const matchedTests = matchConfigTests(testSuite, filteredResults);

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );

  // Extract tests from results that didn't match any config test.
  const extractedTests: TestCase[] = [];
  const matchedResultKeys = buildMatchedResultKeys(matchedTests, testSuite, filteredResults);
  extractRuntimeGeneratedTests(filteredResults, matchedResultKeys, extractedTests);

  if (extractedTests.length > 0) {
    logger.info(
      `[filterTestsByResults] Extracted ${extractedTests.length} runtime-generated test(s) from results`,
    );
  }

  logMatchingStats(matchedTests, extractedTests, filteredResults, uniqueVarsInResults);

  // Deduplicate and return combined tests
  return deduplicateTestCases([...matchedTests, ...extractedTests]);
}
