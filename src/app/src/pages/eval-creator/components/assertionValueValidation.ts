import type { Assertion, AssertionOrSet, AssertionType } from '@promptfoo/types';

export const ARRAY_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'contains-any',
  'contains-all',
  'not-contains-any',
  'not-contains-all',
]);

export const THRESHOLD_ASSERTION_TYPES = new Set<AssertionType>([
  'cost',
  'latency',
  'perplexity',
  'perplexity-score',
  'not-cost',
  'not-latency',
  'not-perplexity',
  'not-perplexity-score',
]);

export const REQUIRED_THRESHOLD_ASSERTION_TYPES = new Set<AssertionType>([
  'cost',
  'latency',
  'not-cost',
  'not-latency',
]);

const REQUIRED_TEXT_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'contains',
  'icontains',
  'starts-with',
  'regex',
  'webhook',
  'not-contains',
  'not-icontains',
  'not-starts-with',
  'not-regex',
  'not-webhook',
  'llm-rubric',
  'similar',
]);

export function getAssertionValueError(assertion: Assertion): string | undefined {
  if (REQUIRED_THRESHOLD_ASSERTION_TYPES.has(assertion.type)) {
    if (
      typeof assertion.threshold !== 'number' ||
      !Number.isFinite(assertion.threshold) ||
      assertion.threshold < 0
    ) {
      return assertion.type === 'latency'
        ? 'Enter a maximum latency in milliseconds, 0 or greater.'
        : 'Enter a maximum cost, 0 or greater.';
    }
  }

  if (
    THRESHOLD_ASSERTION_TYPES.has(assertion.type) &&
    assertion.threshold !== undefined &&
    (typeof assertion.threshold !== 'number' ||
      !Number.isFinite(assertion.threshold) ||
      assertion.threshold < 0)
  ) {
    return 'Enter a threshold value of 0 or greater.';
  }

  if (
    ARRAY_VALUE_ASSERTION_TYPES.has(assertion.type) &&
    (!Array.isArray(assertion.value) || assertion.value.length === 0)
  ) {
    return 'Enter at least one comma-separated value for this check.';
  }

  if (
    REQUIRED_TEXT_VALUE_ASSERTION_TYPES.has(assertion.type) &&
    (typeof assertion.value !== 'string' || assertion.value.trim() === '')
  ) {
    if (assertion.type === 'llm-rubric') {
      return 'Enter grading criteria before using an LLM rubric.';
    }
    if (assertion.type === 'similar') {
      return 'Enter an expected answer for semantic similarity.';
    }

    return 'Enter an expected value before saving this check.';
  }

  return undefined;
}

export function getFirstAssertionValueError(
  assertions: AssertionOrSet[] | undefined,
): string | undefined {
  for (const assertion of assertions ?? []) {
    if (assertion.type === 'assert-set') {
      const nestedError = assertion.assert.map(getAssertionValueError).find(Boolean);
      if (nestedError) {
        return nestedError;
      }
      continue;
    }

    const error = getAssertionValueError(assertion);
    if (error) {
      return error;
    }
  }

  return undefined;
}
