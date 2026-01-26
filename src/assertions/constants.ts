/**
 * Assertion constants that can be imported without circular dependencies.
 *
 * This file intentionally has minimal imports to allow other modules
 * (like runStats) to import these constants without creating cycles.
 */

import type { AssertionType } from '../types/index';

/**
 * Set of assertion types that use LLM calls for evaluation.
 * These assertions require API calls to grade responses.
 */
export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'search-rubric',
]);
