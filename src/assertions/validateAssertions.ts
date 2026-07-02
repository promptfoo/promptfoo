import { z } from 'zod';
import {
  type Assertion,
  type AssertionOrSet,
  AssertionOrSetSchema,
  type AssertionSet,
  type GradingResult,
  type TestCase,
} from '../types/index';

export function hasFallback(assertion: Assertion): boolean {
  return assertion.fallback === 'next' || assertion.fallback === true;
}

export function isSpecialCompareAssertion(assertion: Assertion): boolean {
  return assertion.type.startsWith('select-') || assertion.type === 'max-score';
}

function isAssertionSet(assertion: AssertionOrSet): assertion is AssertionSet {
  return assertion.type === 'assert-set';
}

function isRedteamGuardrail(assertion: Assertion): boolean {
  return assertion.type === 'guardrails' && assertion.config?.purpose === 'redteam';
}

export function isRedteamGuardrailFailure(result: GradingResult): boolean {
  return result.assertion !== undefined && isRedteamGuardrail(result.assertion) && !result.pass;
}

export function isAssertionExecutionFailure(result: GradingResult): boolean {
  return result.metadata?.assertionError === true;
}

/**
 * Validates that fallback-bearing assertions are configured correctly.
 *
 * Runs before assertion-set flattening so that fallback chains cannot bridge
 * across an assert-set boundary. The `path` argument carries dotted-index
 * breadcrumbs (e.g. `assert[2].assert[0]`) into recursive calls so users with
 * nested assert-sets can localize a validation failure.
 */
export function validateFallbackChains(assertions: AssertionOrSet[], path = 'assert'): void {
  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const here = `${path}[${i}]`;

    if (isAssertionSet(assertion)) {
      validateFallbackChains(assertion.assert, `${here}.assert`);
      continue;
    }

    if (!hasFallback(assertion)) {
      continue;
    }

    if (isSpecialCompareAssertion(assertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): ${assertion.type} assertions cannot be fallback chain sources`,
      );
    }

    if (isRedteamGuardrail(assertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): redteam guardrail assertions cannot be fallback chain sources`,
      );
    }

    if (i === assertions.length - 1) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): has fallback but no next assertion to fall through to`,
      );
    }

    const nextAssertion = assertions[i + 1];

    if (isAssertionSet(nextAssertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): next assertion is assert-set (not supported as fallback target)`,
      );
    }

    if (isSpecialCompareAssertion(nextAssertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): next assertion is ${nextAssertion.type} (not supported as fallback target)`,
      );
    }
  }
}

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

function validateFallbackChainsForConfig(assertions: AssertionOrSet[], context: string): void {
  try {
    validateFallbackChains(assertions, context);
  } catch (error) {
    throw new AssertValidationError((error as Error).message);
  }
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
  const parsedDefaultAssertions: AssertionOrSet[] = [];

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
      parsedDefaultAssertions.push(
        parseAssertion(defaultTest.assert[i], `defaultTest.assert[${i}]`),
      );
    }
  }

  // Validate tests array
  if (!Array.isArray(tests)) {
    throw new AssertValidationError('tests must be an array');
  }

  // Validate test case assertions
  for (let testIdx = 0; testIdx < tests.length; testIdx++) {
    const test = tests[testIdx];
    const parsedAssertions: AssertionOrSet[] = [];
    if (test.assert !== undefined) {
      if (!Array.isArray(test.assert)) {
        throw new AssertValidationError(`tests[${testIdx}].assert must be an array`);
      }
      if (test.assert.length > MAX_ASSERTIONS_PER_TEST) {
        throw new AssertValidationError(
          `tests[${testIdx}].assert has ${test.assert.length} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
        );
      }
      for (let i = 0; i < test.assert.length; i++) {
        parsedAssertions.push(parseAssertion(test.assert[i], `tests[${testIdx}].assert[${i}]`));
      }
    }

    const includeDefaultAssertions = test.options?.disableDefaultAsserts !== true;
    const effectiveAssertions = includeDefaultAssertions
      ? [...parsedDefaultAssertions, ...parsedAssertions]
      : parsedAssertions;
    if (effectiveAssertions.length > 0) {
      const fallbackPath =
        includeDefaultAssertions && parsedDefaultAssertions.length > 0
          ? `tests[${testIdx}].mergedAssert`
          : `tests[${testIdx}].assert`;
      validateFallbackChainsForConfig(effectiveAssertions, fallbackPath);
    }
  }

  if (tests.length === 0 && parsedDefaultAssertions.length > 0) {
    validateFallbackChainsForConfig(parsedDefaultAssertions, 'defaultTest.assert');
  }
}
