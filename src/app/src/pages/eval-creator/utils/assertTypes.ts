import type { AssertionType } from '@promptfoo/types';

/**
 * Complete list of available assertion types
 * Centralized to avoid duplication across components
 */
export const ASSERT_TYPES: AssertionType[] = [
  'equals',
  'contains',
  'icontains',
  'contains-all',
  'contains-any',
  'starts-with',
  'regex',
  'is-json',
  'contains-json',
  'is-xml',
  'contains-xml',
  'is-sql',
  'contains-sql',
  //'javascript',
  //'python',
  'similar',
  'llm-rubric',
  'pi',
  'model-graded-closedqa',
  'factuality',
  'webhook',
  'bleu',
  'rouge-n',
  'g-eval',
  'not-equals',
  'not-contains',
  'not-icontains',
  'not-contains-all',
  'not-contains-any',
  'not-starts-with',
  'not-regex',
  'not-is-json',
  'not-contains-json',
  //'not-javascript',
  //'not-python',
  'not-similar',
  'not-webhook',
  'not-rouge-n',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'latency',
  'perplexity',
  'perplexity-score',
  'cost',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'select-best',
  'moderation',
  'finish-reason',
] as const;

/**
 * Assertion types that require string values
 */
export const STRING_VALUE_ASSERT_TYPES: Set<AssertionType> = new Set([
  'equals',
  'contains',
  'icontains',
  'starts-with',
  'regex',
  'similar',
  'llm-rubric',
  'pi',
  'model-graded-closedqa',
  'factuality',
  'webhook',
  'not-equals',
  'not-contains',
  'not-icontains',
  'not-starts-with',
  'not-regex',
  'not-similar',
  'not-webhook',
  'g-eval',
]);

/**
 * Assertion types that require array values
 */
export const ARRAY_VALUE_ASSERT_TYPES: Set<AssertionType> = new Set([
  'contains-all',
  'contains-any',
  'not-contains-all',
  'not-contains-any',
  'select-best',
]);

/**
 * Assertion types that require numeric values
 */
export const NUMERIC_VALUE_ASSERT_TYPES: Set<AssertionType> = new Set([
  'latency',
  'perplexity',
  'perplexity-score',
  'cost',
  'bleu',
  'rouge-n',
  'not-rouge-n',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
]);