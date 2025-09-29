import Eval from '../../models/eval';
import { readOutput, resultIsForTestCase } from '../../util/index';

import type { EvaluateResult, TestSuite } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;

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
  let results: { results: EvaluateResult[] };
  try {
    if (pathOrId.endsWith('.json')) {
      const output = await readOutput(pathOrId);
      results = output.results;
    } else {
      const eval_ = await Eval.findById(pathOrId);
      if (!eval_) {
        return [];
      }
      const summary = await eval_.toEvaluateSummary();
      if ('results' in summary) {
        results = { results: summary.results };
      } else {
        return [];
      }
    }
  } catch {
    return [];
  }

  const filteredResults = results.results.filter(filterFn);

  if (filteredResults.length === 0) {
    return [];
  }

  // Check if we have tests from the original test suite
  const hasOriginalTests = testSuite.tests && testSuite.tests.length > 0;

  // Check if we're dealing with scenarios
  const hasScenarios = testSuite.scenarios && testSuite.scenarios.length > 0;

  const allTests: Tests = [];
  const seenTestKeys = new Set<string>();

  // First, try to match with the original test suite structure
  if (hasOriginalTests) {
    const matchedTests = [...testSuite.tests!].filter((test) =>
      filteredResults.some((result) => resultIsForTestCase(result, test)),
    );

    // If we found matches and don't have scenarios, return only the matched tests
    // (for backwards compatibility with existing tests)
    if (!hasScenarios) {
      return matchedTests;
    }

    // Add matched original tests when we have scenarios
    for (const test of matchedTests) {
      const testKey = JSON.stringify({
        vars: test.vars || {},
        provider: test.provider,
        assert: test.assert,
      });
      if (!seenTestKeys.has(testKey)) {
        seenTestKeys.add(testKey);
        allTests.push(test);
      }
    }
  }

  // When we have scenarios or no original tests, also collect test cases from results
  // This handles scenario-expanded tests
  if (hasScenarios || !hasOriginalTests) {
    for (const result of filteredResults) {
      if (result.testCase) {
        // Create a unique key for deduplication based on vars and provider
        const testKey = JSON.stringify({
          vars: result.testCase.vars || {},
          provider: result.testCase.provider,
          assert: result.testCase.assert,
        });

        if (!seenTestKeys.has(testKey)) {
          seenTestKeys.add(testKey);
          allTests.push(result.testCase);
        }
      }
    }
  }

  return allTests;
}
