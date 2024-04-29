import {TestSuite} from "../../types";

interface Args {
  firstN?: string;
  pattern?: string;
}

export function filterTests(tests: TestSuite['tests'], args: Args) {
  if (!tests) {
    return tests;
  }

  if (Object.keys(args).length === 0) {
    return tests;
  }

  const {firstN, pattern} = args;
  let newTests = [...tests];

  if (pattern)  {
    newTests = newTests.filter((test) => test.description && test.description.match(pattern));
  }

  if (firstN) {
    const count = parseInt(firstN);

    if (isNaN(count)) {
      throw new Error(`firstN must be a number, got: ${firstN}`);
    }

    newTests = newTests.slice(0, count);
  }

  return newTests;
}
