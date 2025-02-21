import Eval from '../../models/eval';
import type { TestSuite, EvaluateResult } from '../../types';
import { ResultFailureReason } from '../../types';
import { readOutput, resultIsForTestCase } from '../../util';

type Tests = NonNullable<TestSuite['tests']>;

export async function filterErrorTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  if (!testSuite.tests) {
    return [];
  }

  console.error(`PathOrId: ${pathOrId}`);

  let results: { results: EvaluateResult[] };
  if (pathOrId.endsWith('.json') || pathOrId.endsWith('.jsonl')) {
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

  const errorResults = results.results.filter(
    (result) => result.failureReason === ResultFailureReason.ERROR,
  );

  if (errorResults.length === 0) {
    return [];
  }

  return [...testSuite.tests].filter((test) => {
    return errorResults.some((result) => resultIsForTestCase(result, test));
  }) as Tests;
}
