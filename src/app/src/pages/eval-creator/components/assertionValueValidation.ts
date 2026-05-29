import type { Assertion, AssertionType } from '@promptfoo/types';

const BASE_ASSERTION_TYPES = [
  'answer-relevance',
  'bleu',
  'classifier',
  'contains',
  'contains-all',
  'contains-any',
  'contains-html',
  'contains-json',
  'contains-sql',
  'contains-xml',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'conversation-relevance',
  'cost',
  'equals',
  'factuality',
  'finish-reason',
  'g-eval',
  'gleu',
  'guardrails',
  'icontains',
  'icontains-all',
  'icontains-any',
  'is-html',
  'is-json',
  'is-refusal',
  'is-sql',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'is-xml',
  'javascript',
  'latency',
  'levenshtein',
  'llm-rubric',
  'meteor',
  'model-graded-closedqa',
  'model-graded-factuality',
  'moderation',
  'perplexity',
  'perplexity-score',
  'pi',
  'python',
  'regex',
  'rouge-n',
  'ruby',
  'search-rubric',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'skill-used',
  'starts-with',
  'tool-call-f1',
  'trace-error-spans',
  'trace-span-count',
  'trace-span-duration',
  'trajectory:goal-success',
  'trajectory:step-count',
  'trajectory:tool-args-match',
  'trajectory:tool-sequence',
  'trajectory:tool-used',
  'webhook',
  'word-count',
] as const satisfies AssertionType[];

const BASE_ASSERTION_TYPE_SET = new Set<string>(BASE_ASSERTION_TYPES);
const SPECIAL_ASSERTION_TYPES = new Set<string>(['max-score', 'select-best']);

function isSupportedAssertionType(type: string): boolean {
  return (
    BASE_ASSERTION_TYPE_SET.has(type) ||
    (type.startsWith('not-') && BASE_ASSERTION_TYPE_SET.has(type.slice(4))) ||
    SPECIAL_ASSERTION_TYPES.has(type) ||
    type.startsWith('promptfoo:redteam:')
  );
}

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

export const TEXT_SCORE_ASSERTION_TYPES = new Set<AssertionType>([
  'bleu',
  'not-bleu',
  'rouge-n',
  'not-rouge-n',
  'similar',
  'not-similar',
]);

export const PI_SCORE_ASSERTION_TYPES = new Set<AssertionType>(['pi', 'not-pi']);

export const RAG_SCORE_ASSERTION_TYPES = new Set<AssertionType>([
  'answer-relevance',
  'not-answer-relevance',
  'context-faithfulness',
  'not-context-faithfulness',
  'context-recall',
  'not-context-recall',
  'context-relevance',
  'not-context-relevance',
]);

export const MODEL_JUDGE_SCORE_ASSERTION_TYPES = new Set<AssertionType>([
  'llm-rubric',
  'not-llm-rubric',
  'g-eval',
  'not-g-eval',
]);

export const TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES = new Set<AssertionType>([
  'trajectory:goal-success',
  'not-trajectory:goal-success',
]);

export const STRUCTURED_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'is-sql',
  'contains-sql',
  'not-is-sql',
  'not-contains-sql',
  'trace-span-count',
  'trace-span-duration',
  'not-trace-span-count',
  'not-trace-span-duration',
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
  'levenshtein',
  'not-levenshtein',
  'model-graded-closedqa',
  'not-model-graded-closedqa',
  'model-graded-factuality',
  'not-model-graded-factuality',
  'pi',
  'not-pi',
  'rouge-n',
  'not-rouge-n',
  'search-rubric',
  'not-search-rubric',
  'select-best',
  'javascript',
  'not-javascript',
  'python',
  'not-python',
  'ruby',
  'not-ruby',
]);

const REQUIRED_STRING_OR_ARRAY_ASSERTION_TYPES = new Set<AssertionType>([
  'bleu',
  'not-bleu',
  'gleu',
  'not-gleu',
  'g-eval',
  'not-g-eval',
  'meteor',
  'not-meteor',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'not-similar',
  'not-similar:cosine',
  'not-similar:dot',
  'not-similar:euclidean',
  'tool-call-f1',
  'not-tool-call-f1',
]);

export const NAMED_MATCHER_ASSERTION_TYPES = new Set<AssertionType>([
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

function hasNonBlankStringOrStringArray(value: unknown): boolean {
  return hasNonBlankString(value) || hasNonBlankStringArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasMatcherName(value: Record<string, unknown>): boolean {
  return hasNonBlankString(value.name) || hasNonBlankString(value.pattern);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function getTrajectoryToolSequenceSteps(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && Array.isArray(value.steps)) {
    return value.steps;
  }

  return undefined;
}

function isUsableTrajectorySequenceStep(step: unknown): boolean {
  return typeof step === 'string' ? step.trim() !== '' : isRecord(step) && hasMatcherName(step);
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
    (assertion.type === 'perplexity-score' || assertion.type === 'not-perplexity-score') &&
    assertion.threshold !== undefined &&
    (typeof assertion.threshold !== 'number' ||
      !Number.isFinite(assertion.threshold) ||
      assertion.threshold < 0 ||
      assertion.threshold > 1)
  ) {
    return 'Enter a normalized score threshold from 0 to 1.';
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
    (TEXT_SCORE_ASSERTION_TYPES.has(assertion.type) ||
      RAG_SCORE_ASSERTION_TYPES.has(assertion.type) ||
      MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(assertion.type) ||
      TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(assertion.type)) &&
    assertion.threshold !== undefined &&
    (typeof assertion.threshold !== 'number' ||
      !Number.isFinite(assertion.threshold) ||
      assertion.threshold < 0 ||
      assertion.threshold > 1)
  ) {
    return 'Enter a score threshold from 0 to 1.';
  }

  if (
    PI_SCORE_ASSERTION_TYPES.has(assertion.type) &&
    assertion.threshold !== undefined &&
    (typeof assertion.threshold !== 'number' ||
      !Number.isFinite(assertion.threshold) ||
      assertion.threshold < 0)
  ) {
    return 'Enter a passing score threshold of 0 or greater.';
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

function getTraceSpanCountValueError(value: unknown): string | undefined {
  if (!isRecord(value) || !hasNonBlankString(value.pattern)) {
    return 'Enter JSON with a span name pattern.';
  }
  if (
    (value.min !== undefined && (typeof value.min !== 'number' || !Number.isFinite(value.min))) ||
    (value.max !== undefined && (typeof value.max !== 'number' || !Number.isFinite(value.max)))
  ) {
    return 'Enter numeric trace span count limits.';
  }
  return undefined;
}

function getTraceSpanDurationValueError(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.max !== 'number' || !Number.isFinite(value.max)) {
    return 'Enter JSON with a maximum trace span duration.';
  }
  if (
    value.percentile !== undefined &&
    (typeof value.percentile !== 'number' ||
      !Number.isFinite(value.percentile) ||
      value.percentile < 0 ||
      value.percentile > 100)
  ) {
    return 'Enter a trace span percentile from 0 to 100.';
  }
  return undefined;
}

function getTrajectoryToolArgsMatchValueError(value: unknown): string | undefined {
  if (!isRecord(value) || !hasMatcherName(value)) {
    return 'Enter JSON with a tool name or pattern and expected args.';
  }
  if (!('args' in value) && !('arguments' in value)) {
    return 'Enter JSON with a tool name or pattern and expected args.';
  }
  if (value.mode !== undefined && value.mode !== 'partial' && value.mode !== 'exact') {
    return 'Set trajectory tool args mode to "partial" or "exact".';
  }
  return undefined;
}

function getTrajectoryStepCountValueError(value: unknown): string | undefined {
  if (!isRecord(value) || (typeof value.min !== 'number' && typeof value.max !== 'number')) {
    return 'Enter JSON with a minimum or maximum trajectory step count.';
  }
  return undefined;
}

function getTrajectoryToolSequenceValueError(value: unknown): string | undefined {
  const steps = getTrajectoryToolSequenceSteps(value);
  if (!steps || steps.length === 0) {
    return 'Enter a non-empty JSON tool sequence.';
  }
  if (!steps.every(isUsableTrajectorySequenceStep)) {
    return 'Each trajectory tool sequence step needs a name or pattern.';
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

  if (assertion.type === 'trace-span-count' || assertion.type === 'not-trace-span-count') {
    return getTraceSpanCountValueError(assertion.value);
  }
  if (assertion.type === 'trace-span-duration' || assertion.type === 'not-trace-span-duration') {
    return getTraceSpanDurationValueError(assertion.value);
  }
  if (
    assertion.type === 'trajectory:tool-args-match' ||
    assertion.type === 'not-trajectory:tool-args-match'
  ) {
    return getTrajectoryToolArgsMatchValueError(assertion.value);
  }
  if (
    assertion.type === 'trajectory:step-count' ||
    assertion.type === 'not-trajectory:step-count'
  ) {
    return getTrajectoryStepCountValueError(assertion.value);
  }
  if (
    assertion.type === 'trajectory:tool-sequence' ||
    assertion.type === 'not-trajectory:tool-sequence'
  ) {
    return getTrajectoryToolSequenceValueError(assertion.value);
  }

  return undefined;
}

function getRequiredStringValueError(assertion: Assertion): string | undefined {
  if (!REQUIRED_STRING_ASSERTION_TYPES.has(assertion.type) || hasNonBlankString(assertion.value)) {
    return undefined;
  }

  if (assertion.type === 'select-best') {
    return 'Enter criteria for selecting the best output.';
  }
  if (assertion.type === 'finish-reason' || assertion.type === 'not-finish-reason') {
    return 'Select or enter the expected finish reason.';
  }
  if (assertion.type === 'webhook' || assertion.type === 'not-webhook') {
    return 'Enter the webhook URL that will validate responses.';
  }
  if (PI_SCORE_ASSERTION_TYPES.has(assertion.type)) {
    return 'Enter criteria for Pi Labs scoring.';
  }
  if (assertion.type === 'context-recall' || assertion.type === 'not-context-recall') {
    return 'Enter the ground truth answer for context recall.';
  }
  if (assertion.type === 'factuality' || assertion.type === 'not-factuality') {
    return 'Enter the factual reference statement.';
  }
  if (
    assertion.type === 'model-graded-closedqa' ||
    assertion.type === 'not-model-graded-closedqa'
  ) {
    return 'Enter the criterion the response must meet.';
  }

  return 'Enter an expected value before saving this check.';
}

function getModerationValueError(assertion: Assertion): string | undefined {
  if (
    (assertion.type === 'moderation' || assertion.type === 'not-moderation') &&
    assertion.value !== undefined &&
    !(
      (typeof assertion.value === 'string' && assertion.value.trim() === '') ||
      // An empty array is truthy, so the runtime handler's invariant
      // (`!value || (Array.isArray(value) && typeof value[0] === 'string')`)
      // throws on `[]`. Require a non-empty string array to match that.
      (Array.isArray(assertion.value) &&
        assertion.value.length > 0 &&
        assertion.value.every((value) => typeof value === 'string'))
    )
  ) {
    return 'Enter moderation categories as a comma-separated list.';
  }

  return undefined;
}

function getBasicExpectedValueError(assertion: Assertion): string | undefined {
  if (
    ARRAY_VALUE_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankStringOrStringArray(assertion.value)
  ) {
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

function getTrajectoryGoalValueError(assertion: Assertion): string | undefined {
  if (
    TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !(isRecord(assertion.value) && hasNonBlankString(assertion.value.goal))
  ) {
    return 'Enter the goal that the agent should achieve.';
  }

  return undefined;
}

function getNamedMatcherValueError(assertion: Assertion): string | undefined {
  if (
    NAMED_MATCHER_ASSERTION_TYPES.has(assertion.type) &&
    !hasNonBlankString(assertion.value) &&
    !hasNonBlankStringArray(assertion.value) &&
    !(isRecord(assertion.value) && hasMatcherName(assertion.value))
  ) {
    return assertion.type.includes('skill')
      ? 'Enter the expected skill name.'
      : 'Enter the expected traced tool name.';
  }

  return undefined;
}

function getSkillCountValueError(assertion: Assertion): string | undefined {
  if (
    (assertion.type === 'skill-used' || assertion.type === 'not-skill-used') &&
    isRecord(assertion.value) &&
    hasMatcherName(assertion.value)
  ) {
    const { min, max } = assertion.value;
    if (
      (min !== undefined && !isNonNegativeInteger(min)) ||
      (max !== undefined && !isNonNegativeInteger(max))
    ) {
      return 'Enter skill count limits as whole numbers, 0 or greater.';
    }
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
      return 'Maximum skill count cannot be less than minimum skill count.';
    }
    if (
      assertion.type === 'not-skill-used' &&
      (min !== undefined || (max !== undefined && max !== 0))
    ) {
      return 'Forbidden skill checks only support no count limit or a maximum of 0.';
    }
  }

  return undefined;
}

function getExpectedValueError(assertion: Assertion): string | undefined {
  return (
    getModerationValueError(assertion) ||
    getBasicExpectedValueError(assertion) ||
    getRequiredStringValueError(assertion) ||
    getTrajectoryGoalValueError(assertion) ||
    getNamedMatcherValueError(assertion) ||
    getSkillCountValueError(assertion)
  );
}

export function getRunnableAssertionValueError(assertion: Assertion): string | undefined {
  if (!isSupportedAssertionType(assertion.type)) {
    return 'Select a supported assertion type before running.';
  }

  return (
    getThresholdError(assertion) ||
    getWordCountError(assertion) ||
    getStructuredValueError(assertion) ||
    getExpectedValueError(assertion)
  );
}

// Save-time entry point. Currently identical to the run-time check, but kept as a
// distinct seam: the editor saves an assertion before it is runnable, and save-time
// validation is expected to diverge (e.g. allow drafts) from run-time validation.
export function getAssertionValueError(assertion: Assertion): string | undefined {
  return getRunnableAssertionValueError(assertion);
}

export function getFirstRunnableAssertionValueError(
  assertions: unknown[] | undefined,
): string | undefined {
  for (const assertion of assertions ?? []) {
    if (!isRecord(assertion) || typeof assertion.type !== 'string') {
      return 'Select a valid assertion type before running.';
    }

    if (assertion.type === 'assert-set') {
      if (!Array.isArray(assertion.assert)) {
        return 'Select a valid assertion type before running.';
      }
      const nestedError = getFirstRunnableAssertionValueError(assertion.assert);
      if (nestedError) {
        return nestedError;
      }
      continue;
    }

    if (!isSupportedAssertionType(assertion.type)) {
      return 'Select a supported assertion type before running.';
    }

    const error = getRunnableAssertionValueError(assertion as Assertion);
    if (error) {
      return error;
    }
  }

  return undefined;
}
