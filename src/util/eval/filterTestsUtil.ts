import logger from '../../logger';
import Eval from '../../models/eval';
import {
  deduplicateTestCases,
  extractRuntimeVars,
  filterRuntimeVars,
  isRuntimeVar,
} from '../../util/comparison';
import { readOutput, resultIsForTestCase } from '../../util/index';

import type { EvaluateResult, TestCase, TestSuite, Vars } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;
type TestFilterFn = (test: TestCase) => boolean;

// Equal vars have the same primitive fields, regardless of insertion order. Nested
// values can share a bucket because resultIsForTestCase still checks full equality.
function primitiveVarsKey(vars: Vars | undefined): string {
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
    return '';
  }
  const fields = [];
  for (const key of Object.keys(vars).sort()) {
    const value = vars[key];
    if (
      !isRuntimeVar(key) &&
      (value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean')
    ) {
      fields.push([key, value]);
    }
  }
  return JSON.stringify(fields);
}

function createCandidateLookup<T>(
  items: T[],
  getVars: (item: T) => Vars | undefined,
  expectedLookups: number,
): (vars: Vars | undefined) => T[] {
  if (items.length < 64 || expectedLookups < 64) {
    return () => items;
  }
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = primitiveVarsKey(getVars(item));
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }
  return (vars) => buckets.get(primitiveVarsKey(vars)) ?? [];
}

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

  // Log unique test cases in filtered results for debugging
  const uniqueVarsInResults = new Set(
    filteredResults.map((r) => JSON.stringify(filterRuntimeVars(r.vars))),
  );
  logger.debug(
    `[filterTestsByResults] ${uniqueVarsInResults.size} unique test cases (by vars) in filtered results`,
  );

  const matchedTests: Tests = [];
  const candidatesForTest = createCandidateLookup(
    filteredResults,
    (result) => result.vars,
    testSuite.tests.length,
  );

  function findMatchingResult(test: TestCase): EvaluateResult | undefined {
    let firstMatch: EvaluateResult | undefined;
    for (const result of candidatesForTest(test.vars)) {
      if (resultIsForTestCase(result, test)) {
        if (extractRuntimeVars(result.vars)) {
          return result;
        }
        firstMatch ??= result;
      }
    }
    return firstMatch;
  }

  const defaultVars =
    typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.vars : undefined;
  const hasDefaultVars = defaultVars && Object.keys(defaultVars).length > 0;
  for (const test of testSuite.tests) {
    // Older saved results can omit default vars.
    const matchedResult =
      findMatchingResult(mergeDefaultVars(test, testSuite.defaultTest)) ??
      (hasDefaultVars ? findMatchingResult(test) : undefined);

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
        logger.debug('[filterTestsByResults] Restored runtime vars for test', {
          varKeys: Object.keys(runtimeVars),
        });
        matchedTests.push(testWithRuntimeVars);
      } else {
        logger.debug('[filterTestsByResults] Matched test has no runtime vars to restore');
        matchedTests.push(test);
      }
    }
  }

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );

  // Extract tests from results that didn't match any config test.
  // This captures runtime-generated tests (e.g., from remote plugins like cipher-code, wordplay)
  // that exist in results but not in the config file.
  const extractedTests: TestCase[] = [];
  const extractedTestKeys = new Set<string>();
  const matchedResultKeys = new Set<string>();

  // Track which results matched config tests
  const matchedTestsWithDefaults = matchedTests.map((test) =>
    mergeDefaultVars(test, testSuite.defaultTest),
  );
  const candidatesForResult = createCandidateLookup(
    matchedTestsWithDefaults,
    (test) => test.vars,
    filteredResults.length,
  );
  for (const result of filteredResults) {
    for (const testWithDefaults of candidatesForResult(result.vars)) {
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

    if (extractedTestFilter && !extractedTestFilter(result.testCase)) {
      continue;
    }

    // Skip if we already extracted a test with these vars (dedup within extraction)
    if (extractedTestKeys.has(resultKey)) {
      continue;
    }

    // Extract test case, filtering runtime vars and omitting provider (security)
    const extractedTest: TestCase = {
      description: result.testCase.description,
      vars: filterRuntimeVars(result.testCase.vars) || {},
      assert: result.testCase.assert,
      metadata: result.testCase.metadata,
      options: result.testCase.options,
      // Intentionally omit: provider (security - may contain stale credentials)
    };
    extractedTests.push(extractedTest);
    extractedTestKeys.add(JSON.stringify(filterRuntimeVars(extractedTest.vars)));
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
