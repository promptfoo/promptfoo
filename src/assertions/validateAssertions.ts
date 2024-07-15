import { TestCase } from '../types';

export class AssertValiationError extends Error {
  constructor(message: string, testCase: TestCase) {
    const testCaseDescription = testCase.description || JSON.stringify(testCase);

    super(`${message} in:\n${testCaseDescription}`);
    this.name = 'AssertValiationError';
  }
}

function validateAssertSet(assertion: object, test: TestCase) {
  if (!('assert' in assertion)) {
    throw new AssertValiationError('assert-set must have an `assert` property', test);
  }

  if (!Array.isArray(assertion.assert)) {
    throw new AssertValiationError('assert-set `assert` must be an array of assertions', test);
  }

  if (assertion.assert.some((assertion) => assertion.type === 'assert-set')) {
    throw new AssertValiationError('assert-set must not have child assert-sets', test);
  }
}

export function validateAssertions(tests: TestCase<Record<string, string | object | string[]>>[]) {
  for (const test of tests) {
    if (test.assert) {
      for (const assertion of test.assert) {
        if (assertion.type === 'assert-set') {
          validateAssertSet(assertion, test);
        }
      }
    }
  }
}
