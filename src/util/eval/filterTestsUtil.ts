import logger from '../../logger';
import Eval from '../../models/eval';
import {
  extractRuntimeVars,
  filterRuntimeVars,
  getTestCaseDeduplicationKey,
} from '../../util/comparison';
import { readOutput, resultIsForTestCase } from '../../util/index';

import type { EvaluateResult, TestCase, TestSuite } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;
type TestFilterFn = (test: TestCase) => boolean;

/**
 * Filters tests based on previous evaluation results
 * @param testSuite - Test suite to filter
 * @param pathOrId - JSON results file path or eval ID
 * @param filterFn - Predicate to determine which results to include
 * @param extractedTestFilter - Optional predicate for runtime-generated tests extracted from results
 * @returns Filtered array of tests
 */
export async function filterTestsByResults(
  testSuite: TestSuite,
  pathOrId: string,
  filterFn: ResultFilterFn,
  extractedTestFilter?: TestFilterFn,
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

  const tests = new Map<string, TestCase>();
  const addTest = (test: TestCase) => {
    const key = getTestCaseDeduplicationKey(test);
    if (!tests.has(key)) {
      tests.set(key, test);
    }
  };
  const matchedResults = new Set<EvaluateResult>();
  const defaults = typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined;
  const hasDefaultVars = defaults?.vars && Object.keys(defaults.vars).length > 0;
  const withDefaults = (test: TestCase): TestCase =>
    defaults
      ? {
          ...test,
          vars: { ...defaults.vars, ...test.vars },
          metadata: { ...defaults.metadata, ...test.metadata },
        }
      : test;

  for (const configuredTest of testSuite.tests) {
    const test = withDefaults(configuredTest);
    let matches = filteredResults.filter((result) => resultIsForTestCase(result, test));
    if (!matches.length && hasDefaultVars) {
      // Older results stored vars before defaultTest.vars were merged.
      const withoutDefaultVars = { ...test, vars: configuredTest.vars };
      matches = filteredResults.filter((result) => resultIsForTestCase(result, withoutDefaultVars));
    }
    if (!matches.length) {
      continue;
    }

    let runtimeVars: TestCase['vars'];
    for (const result of matches) {
      matchedResults.add(result);
      runtimeVars ??= extractRuntimeVars(result.vars);
    }
    addTest(runtimeVars ? { ...test, vars: { ...test.vars, ...runtimeVars } } : test);
  }

  const matchedCount = tests.size;
  logger.debug(
    `[filterTestsByResults] Matched ${matchedCount} unique tests out of ${testSuite.tests.length} in test suite`,
  );

  // Runtime-generated tests may exist only in the saved results.
  for (const result of filteredResults) {
    if (matchedResults.has(result)) {
      continue;
    }

    if (!result.testCase) {
      logger.debug('[filterTestsByResults] Skipping result without testCase data for extraction');
      continue;
    }

    if (extractedTestFilter && !extractedTestFilter(result.testCase)) {
      continue;
    }

    // Omit stored providers, which may contain stale credentials.
    addTest(
      withDefaults({
        description: result.testCase.description,
        vars: filterRuntimeVars(result.testCase.vars) || {},
        assert: result.testCase.assert,
        metadata: result.testCase.metadata,
        options: result.testCase.options,
      }),
    );
  }

  const extractedCount = tests.size - matchedCount;
  if (extractedCount > 0) {
    logger.info(
      `[filterTestsByResults] Extracted ${extractedCount} runtime-generated test(s) from results`,
    );
  }

  if (tests.size === 0) {
    logger.warn(
      `[filterTestsByResults] No tests matched ${filteredResults.length} filtered results. ` +
        'This may indicate a vars or provider mismatch between stored results and current test suite. ' +
        'Use LOG_LEVEL=debug for detailed matching info.',
    );
  }

  return [...tests.values()];
}
