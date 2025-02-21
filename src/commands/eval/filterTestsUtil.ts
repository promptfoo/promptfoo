import Eval from '../../models/eval';
import type { TestSuite, EvaluateResult } from '../../types';
import { readOutput, resultIsForTestCase } from '../../util';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * A function that determines whether a test result should be included in the filtered results.
 * @param result - The evaluation result to check
 * @returns True if the result should be included, false otherwise
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;

/**
 * Filters a test suite based on results from a previous evaluation.
 * Can handle both file paths to JSON results and evaluation IDs.
 *
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an evaluation ID
 * @param filterFn - A function that determines which results to include
 * @returns A filtered array of tests based on the filter function
 * @throws {Error} If the file path is invalid or if the evaluation ID doesn't exist
 */
export async function filterTestsByResults(
  testSuite: TestSuite,
  pathOrId: string,
  filterFn: ResultFilterFn,
): Promise<Tests> {
  if (!testSuite.tests) {
    return [];
  }

  let results: { results: EvaluateResult[] };
  try {
    if (pathOrId.endsWith('.json')) {
      // Handle file path
      const output = await readOutput(pathOrId);
      results = output.results;
    } else {
      // Handle eval ID
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

  return [...testSuite.tests].filter((test) => {
    return filteredResults.some((result) => resultIsForTestCase(result, test));
  }) as Tests;
}
