import logger from '../../logger';
import Eval from '../../models/eval';
import { extractRuntimeVars } from '../../util/comparison';
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
    if (pathOrId.endsWith('.json')) {
      const output = await readOutput(pathOrId);
      results = output.results;
    } else {
      const eval_ = await Eval.findById(pathOrId);
      if (!eval_) {
        logger.warn(`[filterTestsByResults] Evaluation not found: ${pathOrId}`);
        return [];
      }
      const summary = await eval_.toEvaluateSummary();
      if ('results' in summary) {
        results = { results: summary.results };
      } else {
        logger.debug('[filterTestsByResults] No results in evaluation summary');
        return [];
      }
    }
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

  // Match tests against filtered results and restore runtime vars.
  // We try two matching strategies:
  // 1. First, try with defaultTest.vars merged (for new results where defaults are merged)
  // 2. Fallback: try without merging defaults (for old results that don't have defaults merged)
  // This ensures backward compatibility with results stored before the merge was consistent.
  //
  // When a match is found, we restore runtime variables (like _conversation, sessionId)
  // from the result into the test so they're available during re-evaluation.
  const matchedTests: Tests = [];

  for (const test of testSuite.tests) {
    const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);

    // Try matching with merged defaults first (new results)
    let matchedResult = filteredResults.find((result) =>
      resultIsForTestCase(result, testWithDefaults),
    );

    // Fallback: try matching without defaults (old results that don't have defaults merged)
    if (!matchedResult) {
      const hasDefaultVars =
        testSuite.defaultTest &&
        typeof testSuite.defaultTest !== 'string' &&
        testSuite.defaultTest.vars &&
        Object.keys(testSuite.defaultTest.vars).length > 0;

      if (hasDefaultVars) {
        matchedResult = filteredResults.find((result) => resultIsForTestCase(result, test));
      }
    }

    if (matchedResult) {
      // Restore runtime variables from the matched result into the test.
      // This ensures variables like _conversation and sessionId are available
      // during re-evaluation, preventing template render errors.
      const runtimeVars = extractRuntimeVars(matchedResult.vars);
      if (runtimeVars) {
        const testWithRuntimeVars: TestCase = {
          ...test,
          vars: {
            ...test.vars,
            ...runtimeVars,
          },
        };
        logger.debug(
          `[filterTestsByResults] Restored runtime vars for test: ${Object.keys(runtimeVars).join(', ')}`,
        );
        matchedTests.push(testWithRuntimeVars);
      } else {
        matchedTests.push(test);
      }
    }
  }

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );

  if (matchedTests.length === 0 && filteredResults.length > 0) {
    logger.warn(
      `[filterTestsByResults] No tests matched ${filteredResults.length} filtered results. ` +
        'This may indicate a vars mismatch between stored results and current test suite.',
    );
  }

  return matchedTests;
}
