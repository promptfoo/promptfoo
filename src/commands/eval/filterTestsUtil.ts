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
type LoadedResults = { results: EvaluateResult[] };

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

async function loadResults(pathOrId: string): Promise<LoadedResults | undefined> {
  try {
    if (pathOrId.endsWith('.json')) {
      const output = await readOutput(pathOrId);
      return output.results;
    }

    const eval_ = await Eval.findById(pathOrId);
    if (!eval_) {
      logger.warn(`[filterTestsByResults] Evaluation not found: ${pathOrId}`);
      return undefined;
    }

    const summary = await eval_.toEvaluateSummary();
    if (!('results' in summary)) {
      logger.debug('[filterTestsByResults] No results in evaluation summary');
      return undefined;
    }

    return { results: summary.results };
  } catch (error) {
    logger.warn(`[filterTestsByResults] Error loading results: ${error}`);
    return undefined;
  }
}

function hasDefaultVars(testSuite: TestSuite) {
  return (
    testSuite.defaultTest &&
    typeof testSuite.defaultTest !== 'string' &&
    testSuite.defaultTest.vars &&
    Object.keys(testSuite.defaultTest.vars).length > 0
  );
}

function findMatchingResult(
  filteredResults: EvaluateResult[],
  test: TestCase,
  testSuite: TestSuite,
): EvaluateResult | undefined {
  const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);
  const preferRuntimeVars = (candidate: TestCase) =>
    filteredResults.find(
      (result) =>
        resultIsForTestCase(result, candidate) && extractRuntimeVars(result.vars) !== undefined,
    );
  const anyMatch = (candidate: TestCase) =>
    filteredResults.find((result) => resultIsForTestCase(result, candidate));

  return (
    preferRuntimeVars(testWithDefaults) ||
    anyMatch(testWithDefaults) ||
    (hasDefaultVars(testSuite) ? preferRuntimeVars(test) || anyMatch(test) : undefined)
  );
}

function restoreRuntimeVars(test: TestCase, matchedResult: EvaluateResult): TestCase {
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

function collectMatchedTests(
  testSuite: TestSuite,
  filteredResults: EvaluateResult[],
): Tests {
  const matchedTests: Tests = [];
  for (const test of testSuite.tests || []) {
    const matchedResult = findMatchingResult(filteredResults, test, testSuite);
    if (matchedResult) {
      matchedTests.push(restoreRuntimeVars(test, matchedResult));
    }
  }
  return matchedTests;
}

function collectMatchedResultKeys(
  filteredResults: EvaluateResult[],
  matchedTests: Tests,
  defaultTest: TestSuite['defaultTest'],
): Set<string> {
  const matchedResultKeys = new Set<string>();
  for (const result of filteredResults) {
    for (const test of matchedTests) {
      if (resultIsForTestCase(result, mergeDefaultVars(test, defaultTest))) {
        matchedResultKeys.add(JSON.stringify(filterRuntimeVars(result.vars)));
        break;
      }
    }
  }
  return matchedResultKeys;
}

function extractUnmatchedTests(
  filteredResults: EvaluateResult[],
  matchedResultKeys: Set<string>,
): TestCase[] {
  const extractedTests: TestCase[] = [];
  for (const result of filteredResults) {
    const resultKey = JSON.stringify(filterRuntimeVars(result.vars));
    if (matchedResultKeys.has(resultKey)) {
      continue;
    }
    if (!result.testCase) {
      logger.debug('[filterTestsByResults] Skipping result without testCase data for extraction');
      continue;
    }
    if (extractedTests.some((test) => JSON.stringify(filterRuntimeVars(test.vars)) === resultKey)) {
      continue;
    }
    extractedTests.push({
      description: result.testCase.description,
      vars: filterRuntimeVars(result.testCase.vars) || {},
      assert: result.testCase.assert,
      metadata: result.testCase.metadata,
      options: result.testCase.options,
    });
  }
  return extractedTests;
}

function logMatchingCoverage(
  matchedTests: Tests,
  extractedTests: TestCase[],
  filteredResults: EvaluateResult[],
  uniqueVarsInResults: Set<string>,
) {
  if (extractedTests.length > 0) {
    logger.info(
      `[filterTestsByResults] Extracted ${extractedTests.length} runtime-generated test(s) from results`,
    );
  }

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
  const results = await loadResults(pathOrId);
  if (!results) {
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

  const matchedTests = collectMatchedTests(testSuite, filteredResults);

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );
  const matchedResultKeys = collectMatchedResultKeys(
    filteredResults,
    matchedTests,
    testSuite.defaultTest,
  );
  const extractedTests = extractUnmatchedTests(filteredResults, matchedResultKeys);
  logMatchingCoverage(matchedTests, extractedTests, filteredResults, uniqueVarsInResults);

  // Deduplicate and return combined tests
  return deduplicateTestCases([...matchedTests, ...extractedTests]);
}
