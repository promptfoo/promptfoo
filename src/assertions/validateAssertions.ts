import { z } from 'zod';
import {
  type Assertion,
  AssertionOrSetSchema,
  type AssertionSet,
  type TestCase,
} from '../types/index';

export class AssertValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertValidationError';
  }
}

/**
 * Parse and validate a single assertion using Zod schema.
 * Returns the validated assertion with proper type narrowing.
 * Throws AssertValidationError with helpful message on failure.
 */
function parseAssertion(assertion: unknown, context: string): Assertion | AssertionSet {
  // First, check for the most common error: missing 'type' property
  // This provides a more helpful error message than the generic Zod error
  if (typeof assertion !== 'object' || assertion === null) {
    throw new AssertValidationError(
      `Invalid assertion at ${context}:\n` +
        `Expected an object, but got ${assertion === null ? 'null' : typeof assertion}\n\n` +
        `Received: ${JSON.stringify(assertion, null, 2)}`,
    );
  }

  const assertionObj = assertion as Record<string, unknown>;
  if (!('type' in assertionObj) || assertionObj.type === undefined) {
    throw new AssertValidationError(
      `Invalid assertion at ${context}:\n` +
        `Missing required 'type' property\n\n` +
        `Received: ${JSON.stringify(assertion, null, 2)}\n\n` +
        `Hint: In YAML, ensure all assertion properties are under the same list item:\n` +
        `  assert:\n` +
        `    - type: python\n` +
        `      value: file://script.py   # No '-' before 'value'`,
    );
  }

  // Validate with Zod schema for complete validation
  const result = AssertionOrSetSchema.safeParse(assertion);

  if (!result.success) {
    throw new AssertValidationError(
      `Invalid assertion at ${context}:\n` +
        `${z.prettifyError(result.error)}\n\n` +
        `Received: ${JSON.stringify(assertion, null, 2)}`,
    );
  }

  // For assert-set, also validate nested assertions recursively
  if (result.data.type === 'assert-set') {
    const assertSet = result.data as AssertionSet;
    if (!assertSet.assert || !Array.isArray(assertSet.assert)) {
      throw new AssertValidationError(
        `Invalid assertion at ${context}:\n` +
          `assert-set must have an 'assert' property that is an array\n\n` +
          `Received: ${JSON.stringify(assertion, null, 2)}`,
      );
    }
    for (let i = 0; i < assertSet.assert.length; i++) {
      parseAssertion(assertSet.assert[i], `${context}.assert[${i}]`);
    }
  }

  return result.data;
}

// Maximum number of assertions per test case to prevent DoS
const MAX_ASSERTIONS_PER_TEST = 10000;

/**
 * Validate assertions in test cases and defaultTest.
 * Uses Zod schema validation for type safety and helpful error messages.
 *
 * @param tests - Array of test cases to validate
 * @param defaultTest - Optional default test case to validate
 * @throws AssertValidationError if any assertion is malformed
 */

export function validateAssertions(tests: TestCase[], defaultTest?: Partial<TestCase>): void {
  // Validate defaultTest assertions
  if (defaultTest?.assert) {
    if (!Array.isArray(defaultTest.assert)) {
      throw new AssertValidationError('defaultTest.assert must be an array');
    }
    if (defaultTest.assert.length > MAX_ASSERTIONS_PER_TEST) {
      throw new AssertValidationError(
        `defaultTest.assert has ${defaultTest.assert.length} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
      );
    }
    for (let i = 0; i < defaultTest.assert.length; i++) {
      parseAssertion(defaultTest.assert[i], `defaultTest.assert[${i}]`);
    }
  }

  // Validate tests array
  if (!Array.isArray(tests)) {
    throw new AssertValidationError('tests must be an array');
  }

  // Validate test case assertions
  for (let testIdx = 0; testIdx < tests.length; testIdx++) {
    const test = tests[testIdx];
    if (test.assert) {
      if (!Array.isArray(test.assert)) {
        throw new AssertValidationError(`tests[${testIdx}].assert must be an array`);
      }
      if (test.assert.length > MAX_ASSERTIONS_PER_TEST) {
        throw new AssertValidationError(
          `tests[${testIdx}].assert has ${test.assert.length} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
        );
      }
      for (let i = 0; i < test.assert.length; i++) {
        parseAssertion(test.assert[i], `tests[${testIdx}].assert[${i}]`);
      }
    }
  }
}
