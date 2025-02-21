import Eval from '../../models/eval';
import type { TestSuite, EvaluateResult } from '../../types';
import { readOutput, resultIsForTestCase } from '../../util';

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
  if (!testSuite.tests) {
    return [];
  }

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

  return [...testSuite.tests].filter((test) =>
    filteredResults.some((result) => resultIsForTestCase(result, test)),
  );
}
