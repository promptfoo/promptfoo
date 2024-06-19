import { TestSuite } from '../../types';
import { readOutput, resultIsForTestCase } from '../../util';

type Tests = NonNullable<TestSuite['tests']>;

export async function filterFailingTests(testSuite: TestSuite, outputPath: string): Promise<Tests> {
  if (!testSuite.tests) {
    return [];
  }

  const { results } = await readOutput(outputPath);
  const failingResults = results.results.filter((result) => !result.success);

  if (failingResults.length === 0) {
    return [];
  }

  return [...testSuite.tests].filter((test) => {
    return failingResults.some((result) => resultIsForTestCase(result, test));
  }) as Tests;
}
