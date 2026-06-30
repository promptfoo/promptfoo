import logger from '../../logger';
import Eval from '../../models/eval';
import { extractRuntimeVars, filterRuntimeVars } from '../../util/comparison';
import { readOutput, resultIsForTestCase } from '../../util/index';

import type { EvaluateResult, TestCase, TestSuite } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;
type TestFilterFn = (test: TestCase) => boolean;

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

function conversationsExactlyMatch(result: EvaluateResult, test: TestCase): boolean {
  return result.testCase?.metadata?.conversationId === test.metadata?.conversationId;
}

function getExtractedResultKey(result: EvaluateResult): string {
  return JSON.stringify({
    vars: filterRuntimeVars(result.vars),
    conversationId: result.testCase?.metadata?.conversationId,
    strategyId: result.testCase?.metadata?.strategyId,
  });
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

  // Match tests against filtered results and restore runtime vars.
  // We try two matching strategies:
  // 1. First, try with defaultTest.vars merged (for new results where defaults are merged)
  // 2. Fallback: try without merging defaults (for old results that don't have defaults merged)
  // This ensures backward compatibility with results stored before the merge was consistent.
  //
  // When a match is found, we restore runtime variables (like _conversation, sessionId)
  // from the result into the test so they're available during re-evaluation.
  const matchedTests: Tests = [];
  const matchedResults = new Set<EvaluateResult>();
  const hasDefaultVars = Boolean(
    testSuite.defaultTest &&
      typeof testSuite.defaultTest !== 'string' &&
      testSuite.defaultTest.vars &&
      Object.keys(testSuite.defaultTest.vars).length > 0,
  );
  const matchesWithDefaultsByTest = new Map<TestCase, EvaluateResult[]>();
  const matchesWithoutDefaultsByTest = new Map<TestCase, EvaluateResult[]>();
  const allMatchingResultsByTest = new Map<TestCase, EvaluateResult[]>();
  for (const test of testSuite.tests) {
    const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);
    const matchesWithDefaults = filteredResults.filter((result) =>
      resultIsForTestCase(result, testWithDefaults),
    );
    const matchesWithoutDefaults = hasDefaultVars
      ? filteredResults.filter((result) => resultIsForTestCase(result, test))
      : [];
    matchesWithDefaultsByTest.set(test, matchesWithDefaults);
    matchesWithoutDefaultsByTest.set(test, matchesWithoutDefaults);
    allMatchingResultsByTest.set(
      test,
      Array.from(new Set([...matchesWithDefaults, ...matchesWithoutDefaults])),
    );
  }
  const resultsWithExactConversationMatches = new Set<EvaluateResult>();
  for (const [test, results] of allMatchingResultsByTest) {
    for (const result of results) {
      if (conversationsExactlyMatch(result, test)) {
        resultsWithExactConversationMatches.add(result);
      }
    }
  }

  for (const test of testSuite.tests) {
    const isEligibleConversationMatch = (result: EvaluateResult) =>
      conversationsExactlyMatch(result, test) || !resultsWithExactConversationMatches.has(result);
    const eligibleMatchesWithDefaults = (matchesWithDefaultsByTest.get(test) ?? []).filter(
      isEligibleConversationMatch,
    );
    const eligibleMatchesWithoutDefaults = (matchesWithoutDefaultsByTest.get(test) ?? []).filter(
      isEligibleConversationMatch,
    );
    const matchingResults =
      eligibleMatchesWithDefaults.length > 0 || !hasDefaultVars
        ? eligibleMatchesWithDefaults
        : eligibleMatchesWithoutDefaults;
    const allMatchingResults = Array.from(
      new Set([...eligibleMatchesWithDefaults, ...eligibleMatchesWithoutDefaults]),
    );
    const matchedResult =
      matchingResults.find((result) => extractRuntimeVars(result.vars) !== undefined) ??
      matchingResults[0];

    if (matchedResult) {
      for (const result of allMatchingResults) {
        matchedResults.add(result);
      }
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
  const extractedResultKeys = new Set<string>();

  // Extract tests from unmatched results
  for (const result of filteredResults) {
    // Skip if this result already matched a config test
    if (matchedResults.has(result)) {
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

    // Results for the same logical runtime-generated test may be repeated across prompts and
    // providers. Preserve distinct conversations and strategies without multiplying those rows.
    const resultKey = getExtractedResultKey(result);
    if (extractedResultKeys.has(resultKey)) {
      continue;
    }
    extractedResultKeys.add(resultKey);

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

  // Each configured test is visited at most once above, and extracted tests are deduplicated
  // while they are collected. Preserve configured rows that intentionally share vars.
  return [...matchedTests, ...extractedTests];
}
