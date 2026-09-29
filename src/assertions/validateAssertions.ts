import { z } from 'zod';
import {
  type Assertion,
  type AssertionOrSet,
  AssertionOrSetSchema,
  type AssertionSet,
  type GradingResult,
  type Scenario,
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
  // Inverting a guardrail must not allow fallback to hide its failure.
  const normalizedType = assertion.type.toLowerCase();
  const baseType = normalizedType.startsWith('not-') ? normalizedType.slice(4) : normalizedType;
  return baseType === 'guardrails' && assertion.config?.purpose === 'redteam';
}

export function isRedteamGuardrailFailure(result: GradingResult): boolean {
  return result.assertion !== undefined && isRedteamGuardrail(result.assertion) && !result.pass;
}

export function isAssertionExecutionFailure(result: GradingResult): boolean {
  return result.metadata?.assertionError === true;
}

/** Validate chains before flattening so they cannot cross assertion-set boundaries. */
export function validateFallbackChains(assertions: AssertionOrSet[], path = 'assert'): void {
  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const here = `${path}[${i}]`;

    if (isAssertionSet(assertion)) {
      // A fallback inside a nested assert-set cannot reach a runtime-appended
      // scenario assertion, so the relaxation never propagates into recursion.
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

// Prevent recursive assertion parsing from turning malformed configs into
// unbounded work before schema validation can report them.
const MAX_ASSERTIONS_PER_TEST = 10000;
const MAX_ASSERTION_NESTING = 100;

function countAssertions(assertions: unknown[], context: string, depth = 0): number {
  if (depth > MAX_ASSERTION_NESTING) {
    throw new AssertValidationError(`${context} exceeds maximum assertion nesting`);
  }

  let count = 0;
  for (let i = 0; i < assertions.length; i++) {
    count++;
    if (count > MAX_ASSERTIONS_PER_TEST) {
      throw new AssertValidationError(
        `${context} has more than ${MAX_ASSERTIONS_PER_TEST} assertions`,
      );
    }
    const assertion = assertions[i];
    if (
      typeof assertion === 'object' &&
      assertion !== null &&
      (assertion as Record<string, unknown>).type === 'assert-set' &&
      Array.isArray((assertion as Record<string, unknown>).assert)
    ) {
      count += countAssertions(
        (assertion as Record<string, unknown>).assert as unknown[],
        `${context}[${i}].assert`,
        depth + 1,
      );
      if (count > MAX_ASSERTIONS_PER_TEST) {
        throw new AssertValidationError(
          `${context} has more than ${MAX_ASSERTIONS_PER_TEST} assertions`,
        );
      }
    }
  }
  return count;
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
  if (assertionObj.type === 'assert-set' && assertionObj.fallback !== undefined) {
    throw new AssertValidationError(
      `Invalid assertion at ${context}: assert-set assertions cannot be fallback chain sources`,
    );
  }
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

function parseAssertionList(
  input: unknown,
  path: string,
): { assertions: AssertionOrSet[]; count: number } {
  if (input === undefined) {
    return { assertions: [], count: 0 };
  }
  if (!Array.isArray(input)) {
    throw new AssertValidationError(`${path} must be an array`);
  }
  if (input.length > MAX_ASSERTIONS_PER_TEST) {
    throw new AssertValidationError(
      `${path} has ${input.length} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
    );
  }
  const count = countAssertions(input, path);
  return {
    assertions: input.map((assertion, index) => parseAssertion(assertion, `${path}[${index}]`)),
    count,
  };
}

/**
 * Validate assertions in test cases and defaultTest.
 * Uses Zod schema validation for type safety and helpful error messages.
 *
 * @param tests - Array of test cases to validate
 * @param defaultTest - Optional default test case to validate
 * @throws AssertValidationError if any assertion is malformed
 */

export function validateAssertions(
  tests: TestCase[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
): void {
  const { assertions: parsedDefaultAssertions, count: defaultAssertionCount } = parseAssertionList(
    defaultTest?.assert,
    'defaultTest.assert',
  );

  // Validate tests array
  if (!Array.isArray(tests)) {
    throw new AssertValidationError('tests must be an array');
  }

  const validationTests = [
    ...tests.map((test, index) => ({ test, path: `tests[${index}]` })),
    ...(scenarios?.flatMap((scenario, scenarioIndex) =>
      (scenario.config || []).flatMap((data, configIndex) =>
        (scenario.tests || [{}]).map((test, testIndex) => ({
          test: {
            ...test,
            options: { ...defaultTest?.options, ...data.options, ...test.options },
            assert: [...(data.assert || []), ...(test.assert || [])],
          },
          path: `scenarios[${scenarioIndex}].config[${configIndex}].tests[${testIndex}]`,
        })),
      ),
    ) || []),
  ];

  // Validate test case assertions
  for (let testIdx = 0; testIdx < validationTests.length; testIdx++) {
    const { test, path } = validationTests[testIdx];
    const { assertions: parsedAssertions, count: testAssertionCount } = parseAssertionList(
      test.assert,
      `${path}.assert`,
    );

    const includeDefaultAssertions = test.options?.disableDefaultAsserts !== true;
    const effectiveAssertions = includeDefaultAssertions
      ? [...parsedDefaultAssertions, ...parsedAssertions]
      : parsedAssertions;
    const effectiveAssertionCount = includeDefaultAssertions
      ? defaultAssertionCount + testAssertionCount
      : testAssertionCount;
    if (effectiveAssertionCount > MAX_ASSERTIONS_PER_TEST) {
      throw new AssertValidationError(
        `${path}.mergedAssert has ${effectiveAssertionCount} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
      );
    }
    if (effectiveAssertions.length > 0) {
      const fallbackPath =
        includeDefaultAssertions && parsedDefaultAssertions.length > 0
          ? `${path}.mergedAssert`
          : `${path}.assert`;
      validateFallbackChainsForConfig(effectiveAssertions, fallbackPath);
    }
  }

  if (validationTests.length === 0 && parsedDefaultAssertions.length > 0) {
    validateFallbackChainsForConfig(parsedDefaultAssertions, 'defaultTest.assert');
  }
}
