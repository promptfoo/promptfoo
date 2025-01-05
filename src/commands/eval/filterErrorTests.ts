import type { TestSuite } from '../../types';
import { ResultFailureReason } from '../../types';
import { readOutput, resultIsForTestCase } from '../../util';

type Tests = NonNullable<TestSuite['tests']>;

export async function filterErrorTests(testSuite: TestSuite, outputPath: string): Promise<Tests> {
  if (!testSuite.tests) {
    return [];
  }

  const { results } = await readOutput(outputPath);
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
