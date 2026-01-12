import logger from '../../logger';
import Eval from '../../models/eval';
import { deduplicateTestCases, filterRuntimeVars } from '../../util/comparison';
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

  // Log unique test cases in filtered results for debugging
  const uniqueVarsInResults = new Set(
    filteredResults.map((r) => JSON.stringify(filterRuntimeVars(r.vars))),
  );
  logger.debug(
    `[filterTestsByResults] ${uniqueVarsInResults.size} unique test cases (by vars) in filtered results`,
  );

  // Match tests against filtered results.
  // We try two matching strategies:
  // 1. First, try with defaultTest.vars merged (for new results where defaults are merged)
  // 2. Fallback: try without merging defaults (for old results that don't have defaults merged)
  // This ensures backward compatibility with results stored before the merge was consistent.
  const matchedTests = [...testSuite.tests].filter((test) => {
    const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);

    // Try matching with merged defaults first (new results)
    if (filteredResults.some((result) => resultIsForTestCase(result, testWithDefaults))) {
      return true;
    }

    // Fallback: try matching without defaults (old results that don't have defaults merged)
    // Only try fallback if defaultTest.vars actually adds something
    const hasDefaultVars =
      testSuite.defaultTest &&
      typeof testSuite.defaultTest !== 'string' &&
      testSuite.defaultTest.vars &&
      Object.keys(testSuite.defaultTest.vars).length > 0;

    if (hasDefaultVars) {
      return filteredResults.some((result) => resultIsForTestCase(result, test));
    }

    return false;
  });

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );

  // Extract tests from results that didn't match any config test.
  // This captures runtime-generated tests (e.g., from remote plugins like cipher-code, wordplay)
  // that exist in results but not in the config file.
  const extractedTests: TestCase[] = [];
  const matchedResultKeys = new Set<string>();

  // Track which results matched config tests
  for (const result of filteredResults) {
    for (const test of matchedTests) {
      const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);
      if (resultIsForTestCase(result, testWithDefaults)) {
        matchedResultKeys.add(JSON.stringify(filterRuntimeVars(result.vars)));
        break;
      }
    }
  }

  // Extract tests from unmatched results
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
  } else if (matchedTests.length + extractedTests.length < uniqueVarsInResults.size) {
    logger.debug(
      `[filterTestsByResults] Note: ${uniqueVarsInResults.size - matchedTests.length - extractedTests.length} unique test cases in results ` +
        'did not match any test in the current test suite and could not be extracted. ' +
        'This may indicate results without testCase data.',
    );
  }

  // Deduplicate and return combined tests
  return deduplicateTestCases([...matchedTests, ...extractedTests]);
}
