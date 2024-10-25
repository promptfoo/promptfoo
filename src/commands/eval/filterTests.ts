import type { TestSuite } from '../../types';
import { filterFailingTests } from './filterFailingTests';

interface Args {
  firstN?: string | number;
  pattern?: string;
  failing?: string;
}

type Tests = TestSuite['tests'];

export async function filterTests(testSuite: TestSuite, args: Args): Promise<Tests> {
  const tests = testSuite.tests;

  if (!tests) {
    return tests;
  }

  if (Object.keys(args).length === 0) {
    return tests;
  }

  const { firstN, pattern, failing } = args;
  let newTests: NonNullable<Tests>;

  if (failing) {
    newTests = await filterFailingTests(testSuite, failing);
  } else {
    newTests = [...tests];
  }

  if (pattern) {
    newTests = newTests.filter((test) => test.description && test.description.match(pattern));
  }

  if (firstN) {
    const count = typeof firstN === 'number' ? firstN : Number.parseInt(firstN);

    if (Number.isNaN(count)) {
      throw new Error(`firstN must be a number, got: ${firstN}`);
    }

    newTests = newTests.slice(0, count);
  }

  return newTests;
}
