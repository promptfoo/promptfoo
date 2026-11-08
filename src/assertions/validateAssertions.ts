import { z } from 'zod';
import {
  type Assertion,
  type AssertionOrSet,
  AssertionOrSetSchema,
  type AssertionSet,
  BaseAssertionTypesSchema,
  type Scenario,
  type TestCase,
} from '../types/index';

export class AssertValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertValidationError';
  }
}

const FALLBACK_SOURCES = new Set(['equals', 'contains', 'icontains', 'starts-with']);
const FALLBACK_TARGETS = new Set<string>(BaseAssertionTypesSchema.options);

/** Keep each chain inside its own configured assertion list. */
export function validateFallbackChains(assertions: AssertionOrSet[], path = 'assert'): void {
  for (const [index, assertion] of assertions.entries()) {
    const here = `${path}[${index}]`;
    if (assertion.type === 'assert-set') {
      if ('fallback' in assertion) {
        throw new AssertValidationError(`${here}: assert-set cannot start a fallback chain`);
      }
      validateFallbackChains(assertion.assert, `${here}.assert`);
      continue;
    }
    if (assertion.fallback === undefined) {
      continue;
    }
    const type = assertion.type.replace(/^not-/, '');
    if (assertion.fallback !== 'next' || !FALLBACK_SOURCES.has(type)) {
      throw new AssertValidationError(
        `${here}: fallback: next requires equals, contains, icontains, or starts-with (including not- variants)`,
      );
    }
    if (
      !['string', 'number'].includes(typeof assertion.value) ||
      (typeof assertion.value === 'number' && !Number.isFinite(assertion.value)) ||
      (type === 'starts-with' && typeof assertion.value !== 'string') ||
      (type !== 'equals' && assertion.value === '') ||
      (typeof assertion.value === 'string' && /^(file:\/\/|package:)/.test(assertion.value)) ||
      assertion.transform !== undefined ||
      assertion.contextTransform !== undefined
    ) {
      throw new AssertValidationError(
        `${here}: fallback sources require literal string or number values and cannot use scripts or transforms`,
      );
    }
    if (
      assertion.weight !== undefined &&
      (!Number.isFinite(assertion.weight) || assertion.weight <= 0)
    ) {
      throw new AssertValidationError(`${here}: fallback sources require a positive weight`);
    }
    const next = assertions[index + 1];
    const nextType = next?.type.replace(/^not-/, '');
    if (!nextType || !FALLBACK_TARGETS.has(nextType) || nextType === 'guardrails') {
      throw new AssertValidationError(
        `${here}: fallback requires a following ordinary assertion in the same list; sets, comparisons and redteam checks are unsupported`,
      );
    }
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
  if (assertionObj.type === 'assert-set' && assertionObj.fallback !== undefined) {
    throw new AssertValidationError(`${context}: assert-set cannot start a fallback chain`);
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

const MAX_ASSERTIONS_PER_TEST = 10000;

function validateAssertionList(input: unknown, path: string): void {
  if (input === undefined) {
    return;
  }
  if (!Array.isArray(input)) {
    throw new AssertValidationError(`${path} must be an array`);
  }
  if (input.length > MAX_ASSERTIONS_PER_TEST) {
    throw new AssertValidationError(
      `${path} has ${input.length} assertions, exceeding maximum of ${MAX_ASSERTIONS_PER_TEST}`,
    );
  }
  const assertions = input.map((assertion, index) =>
    parseAssertion(assertion, `${path}[${index}]`),
  );
  validateFallbackChains(assertions, path);
}

export function validateAssertions(
  tests: TestCase[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
): void {
  if (!Array.isArray(tests)) {
    throw new AssertValidationError('tests must be an array');
  }
  validateAssertionList(defaultTest?.assert, 'defaultTest.assert');
  tests.forEach((test, index) => validateAssertionList(test.assert, `tests[${index}].assert`));
  scenarios?.forEach((scenario, scenarioIndex) => {
    scenario.config?.forEach((test, index) =>
      validateAssertionList(test.assert, `scenarios[${scenarioIndex}].config[${index}].assert`),
    );
    scenario.tests?.forEach((test, index) =>
      validateAssertionList(test.assert, `scenarios[${scenarioIndex}].tests[${index}].assert`),
    );
  });
}
