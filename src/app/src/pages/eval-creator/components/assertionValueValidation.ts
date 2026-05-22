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

export const COMMA_SEPARATED_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  ...ARRAY_VALUE_ASSERTION_TYPES,
  'moderation',
  'not-moderation',
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

export const WORD_COUNT_ASSERTION_TYPES = new Set<AssertionType>(['word-count', 'not-word-count']);

export const STRUCTURED_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'is-sql',
  'contains-sql',
  'not-is-sql',
  'not-contains-sql',
  'trajectory:tool-args-match',
  'trajectory:tool-sequence',
  'trajectory:step-count',
  'not-trajectory:tool-args-match',
  'not-trajectory:tool-sequence',
  'not-trajectory:step-count',
]);

const OPTIONAL_SQL_CONFIGURATION_TYPES = new Set<AssertionType>([
  'is-sql',
  'contains-sql',
  'not-is-sql',
  'not-contains-sql',
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

const REQUIRED_GOAL_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'trajectory:goal-success',
  'not-trajectory:goal-success',
]);

const REQUIRED_MATCHER_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'skill-used',
  'not-skill-used',
  'trajectory:tool-used',
  'not-trajectory:tool-used',
]);

function hasNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasNonBlankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasNonBlankString);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasMatcherName(value: Record<string, unknown>): boolean {
  return hasNonBlankString(value.name) || hasNonBlankString(value.pattern);
}

function getThresholdError(assertion: Assertion): string | undefined {
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

  return undefined;
}

function isUsableWordCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function getWordCountError(assertion: Assertion): string | undefined {
  if (!WORD_COUNT_ASSERTION_TYPES.has(assertion.type)) {
    return undefined;
  }

  if (isUsableWordCount(assertion.value)) {
    return undefined;
  }

  if (typeof assertion.value === 'string' && assertion.value.trim() !== '') {
    const parsedValue = Number(assertion.value);
    return isUsableWordCount(parsedValue)
      ? undefined
      : 'Enter word counts as whole numbers, 0 or greater.';
  }

  if (!isRecord(assertion.value)) {
    return 'Enter an exact word count or at least one limit.';
  }

  const { min, max } = assertion.value;
  if (min === undefined && max === undefined) {
    return 'Enter an exact word count or at least one limit.';
  }
  if (
    (min !== undefined && !isUsableWordCount(min)) ||
    (max !== undefined && !isUsableWordCount(max))
  ) {
    return 'Enter word counts as whole numbers, 0 or greater.';
  }
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    return 'Minimum word count cannot exceed maximum word count.';
  }

  return undefined;
}

function getStructuredValueError(assertion: Assertion): string | undefined {
  if (
    OPTIONAL_SQL_CONFIGURATION_TYPES.has(assertion.type) &&
    assertion.value !== undefined &&
    !isRecord(assertion.value)
  ) {
    return 'Enter optional SQL validation settings as a JSON object.';
  }

  if (
    (assertion.type === 'trajectory:tool-args-match' ||
      assertion.type === 'not-trajectory:tool-args-match') &&
    (!isRecord(assertion.value) ||
      !hasMatcherName(assertion.value) ||
      (!('args' in assertion.value) && !('arguments' in assertion.value)))
  ) {
    return 'Enter JSON with a tool name or pattern and expected args.';
  }

  if (
    (assertion.type === 'trajectory:step-count' ||
      assertion.type === 'not-trajectory:step-count') &&
    (!isRecord(assertion.value) ||
      (typeof assertion.value.min !== 'number' && typeof assertion.value.max !== 'number'))
  ) {
    return 'Enter JSON with a minimum or maximum trajectory step count.';
  }

  if (
    (assertion.type === 'trajectory:tool-sequence' ||
      assertion.type === 'not-trajectory:tool-sequence') &&
    !(
      (Array.isArray(assertion.value) && assertion.value.length > 0) ||
      (isRecord(assertion.value) &&
        Array.isArray(assertion.value.steps) &&
        assertion.value.steps.length > 0)
    )
  ) {
    return 'Enter a non-empty JSON tool sequence.';
  }

  return undefined;
}

function getExpectedValueError(assertion: Assertion): string | undefined {
  if (
    (assertion.type === 'moderation' || assertion.type === 'not-moderation') &&
    assertion.value !== undefined &&
    (!Array.isArray(assertion.value) ||
      !assertion.value.every((value) => typeof value === 'string'))
  ) {
    return 'Enter moderation categories as a comma-separated list.';
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

  if (
    REQUIRED_GOAL_VALUE_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !(isRecord(assertion.value) && hasNonBlankString(assertion.value.goal))
  ) {
    return 'Enter the goal that the agent should achieve.';
  }

  if (
    REQUIRED_MATCHER_VALUE_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !hasNonBlankStringArray(assertion.value) &&
    !(isRecord(assertion.value) && hasMatcherName(assertion.value))
  ) {
    return 'Enter a skill or tool name to match.';
  }

  return undefined;
}

export function getRunnableAssertionValueError(assertion: Assertion): string | undefined {
  return (
    getThresholdError(assertion) ||
    getWordCountError(assertion) ||
    getStructuredValueError(assertion) ||
    getExpectedValueError(assertion)
  );
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
