import type { Assertion, AssertionOrSet, AssertionType } from '@promptfoo/types';

export const ARRAY_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'contains-any',
  'contains-all',
  'icontains-any',
  'icontains-all',
  'not-contains-any',
  'not-contains-all',
  'not-icontains-any',
  'not-icontains-all',
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

const REQUIRED_TEXT_OR_NUMBER_ASSERTION_TYPES = new Set<AssertionType>([
  'contains',
  'icontains',
  'not-contains',
  'not-icontains',
]);

const REQUIRED_STRING_ASSERTION_TYPES = new Set<AssertionType>([
  'starts-with',
  'regex',
  'webhook',
  'not-starts-with',
  'not-regex',
  'not-webhook',
  'context-recall',
  'not-context-recall',
  'factuality',
  'not-factuality',
  'finish-reason',
  'not-finish-reason',
  'model-graded-closedqa',
  'not-model-graded-closedqa',
  'pi',
  'not-pi',
  'rouge-n',
  'not-rouge-n',
  'select-best',
]);

const REQUIRED_STRING_OR_ARRAY_ASSERTION_TYPES = new Set<AssertionType>([
  'bleu',
  'not-bleu',
  'g-eval',
  'not-g-eval',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'not-similar',
  'not-similar:cosine',
  'not-similar:dot',
  'not-similar:euclidean',
]);

function hasNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasNonBlankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasNonBlankString);
}

export function getRunnableAssertionValueError(assertion: Assertion): string | undefined {
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

  if (ARRAY_VALUE_ASSERTION_TYPES.has(assertion.type) && !hasNonBlankStringArray(assertion.value)) {
    return 'Enter at least one comma-separated value for this check.';
  }

  if (
    REQUIRED_TEXT_OR_NUMBER_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !(
      typeof assertion.value === 'number' &&
      Number.isFinite(assertion.value) &&
      assertion.value !== 0
    )
  ) {
    return 'Enter an expected value before saving this check.';
  }

  if (REQUIRED_STRING_ASSERTION_TYPES.has(assertion.type) && !hasNonBlankString(assertion.value)) {
    return 'Enter an expected value before saving this check.';
  }

  if (
    REQUIRED_STRING_OR_ARRAY_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !hasNonBlankStringArray(assertion.value)
  ) {
    if (assertion.type.includes('similar')) {
      return 'Enter an expected answer for semantic similarity.';
    }
    if (assertion.type.includes('g-eval')) {
      return 'Enter at least one grading criterion for G-Eval.';
    }

    return 'Enter at least one reference answer for this check.';
  }

  return undefined;
}

export function getAssertionValueError(assertion: Assertion): string | undefined {
  return getRunnableAssertionValueError(assertion);
}

export function getFirstRunnableAssertionValueError(
  assertions: AssertionOrSet[] | undefined,
): string | undefined {
  for (const assertion of assertions ?? []) {
    if (assertion.type === 'assert-set') {
      const nestedError = assertion.assert.map(getRunnableAssertionValueError).find(Boolean);
      if (nestedError) {
        return nestedError;
      }
      continue;
    }

    const error = getRunnableAssertionValueError(assertion);
    if (error) {
      return error;
    }
  }

  return undefined;
}
