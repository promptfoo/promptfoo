import { z } from 'zod';
import {
  type Assertion,
  AssertionOrSetSchema,
  type AssertionSet,
  type CombinatorAssertion,
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
function parseAssertion(
  assertion: unknown,
  context: string,
): Assertion | AssertionSet | CombinatorAssertion {
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

  // Track if we're inside a combinator for nested validation
  const isInsideCombinator = context.includes('.assert[') && /\b(and|or)\b/.test(context);

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
    // Check for select-best/max-score inside assert-sets that are within combinators
    for (let i = 0; i < assertSet.assert.length; i++) {
      const subAssertion = assertSet.assert[i];
      if (
        isInsideCombinator &&
        'type' in subAssertion &&
        (subAssertion.type === 'select-best' || subAssertion.type === 'max-score')
      ) {
        throw new AssertValidationError(
          `Invalid assertion at ${context}.assert[${i}]:\n` +
            `${subAssertion.type} cannot be used inside a combinator (even within an assert-set)`,
        );
      }
      parseAssertion(subAssertion, `${context}.assert[${i}]`);
    }
  }

  // For combinator assertions (and/or), validate nested assertions recursively
  if (result.data.type === 'and' || result.data.type === 'or') {
    const combinator = result.data as CombinatorAssertion;
    if (!combinator.assert || !Array.isArray(combinator.assert)) {
      throw new AssertValidationError(
        `Invalid assertion at ${context}:\n` +
          `${result.data.type} combinator must have an 'assert' property that is an array\n\n` +
          `Received: ${JSON.stringify(assertion, null, 2)}`,
      );
    }
    if (combinator.assert.length === 0) {
      throw new AssertValidationError(
        `Invalid assertion at ${context}:\n` +
          `${result.data.type} combinator must have at least one assertion\n\n` +
          `Received: ${JSON.stringify(assertion, null, 2)}`,
      );
    }
    // Validate that select-best and max-score are not used inside combinators
    for (let i = 0; i < combinator.assert.length; i++) {
      const subAssertion = combinator.assert[i];
      if (
        'type' in subAssertion &&
        (subAssertion.type === 'select-best' || subAssertion.type === 'max-score')
      ) {
        throw new AssertValidationError(
          `Invalid assertion at ${context}.assert[${i}]:\n` +
            `${subAssertion.type} cannot be used inside ${result.data.type} combinator`,
        );
      }
      parseAssertion(subAssertion, `${context}[${result.data.type}].assert[${i}]`);
    }
  }

  return result.data;
}

// Maximum number of assertions per test case to prevent DoS
const MAX_ASSERTIONS_PER_TEST = 10000;
// Maximum nesting depth for combinators to prevent stack overflow
const MAX_COMBINATOR_DEPTH = 10;

/**
 * Count total assertions including nested ones in combinators and assert-sets.
 */
function countNestedAssertions(assertions: unknown[], depth = 0): number {
  if (depth > MAX_COMBINATOR_DEPTH) {
    throw new AssertValidationError(
      `Combinator nesting depth exceeds maximum of ${MAX_COMBINATOR_DEPTH}`,
    );
  }

  let count = 0;
  for (const assertion of assertions) {
    count += 1;
    const obj = assertion as Record<string, unknown>;
    if (obj?.type === 'and' || obj?.type === 'or' || obj?.type === 'assert-set') {
      const nested = obj.assert as unknown[];
      if (Array.isArray(nested)) {
        count += countNestedAssertions(nested, depth + 1);
      }
    }
  }
  return count;
}

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
    // Check nested depth and total count
    countNestedAssertions(defaultTest.assert);
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
      // Check nested depth and total count
      countNestedAssertions(test.assert);
      for (let i = 0; i < test.assert.length; i++) {
        parseAssertion(test.assert[i], `tests[${testIdx}].assert[${i}]`);
      }
    }
  }
}
