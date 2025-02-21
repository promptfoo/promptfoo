import type { TestSuite, EvaluateResult } from '../../types';
import { ResultFailureReason } from '../../types';
import { readOutput, resultIsForTestCase, getEvalFromId } from '../../util';

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
    const eval_ = await getEvalFromId(pathOrId);
    if (!eval_) {
      return [];
    }
    console.error(`Eval ID: ${eval_.id}`);
    console.error(`Eval results: ${JSON.stringify(eval_.results, null, 2)}`);
    results = eval_.results;
  }

  const errorResults = (results.results || []).filter(
    (result) => result.failureReason === ResultFailureReason.ERROR,
  );

  if (errorResults.length === 0) {
    return [];
  }

  return [...testSuite.tests].filter((test) => {
    return errorResults.some((result) => resultIsForTestCase(result, test));
  }) as Tests;
}
