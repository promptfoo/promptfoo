import type { TestSuite, EvaluateResult } from '../../types';
import { readOutput, resultIsForTestCase, getEvalFromId } from '../../util';

type Tests = NonNullable<TestSuite['tests']>;

export async function filterFailingTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  if (!testSuite.tests) {
    return [];
  }

  let results: { results: EvaluateResult[] };
  if (pathOrId.endsWith('.json') || pathOrId.endsWith('.jsonl')) {
    // Handle file path
    const output = await readOutput(pathOrId);
    results = output.results;
  } else {
    // Handle eval ID
    const eval_ = await getEvalFromId(pathOrId);
    if (!eval_) {
      return [];
    }
    results = eval_.results;
  }

  const failingResults = results.results.filter((result) => !result.success);

  if (failingResults.length === 0) {
    return [];
  }

  return [...testSuite.tests].filter((test) => {
    return failingResults.some((result) => resultIsForTestCase(result, test));
  }) as Tests;
}
