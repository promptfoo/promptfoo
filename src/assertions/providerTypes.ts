import type { AssertionType } from '../types/index';

export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'agent-rubric',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'search-rubric',
  'trajectory:goal-success',
]);

const PROVIDER_GRADED_ASSERTION_TYPES = new Set<string>([
  ...MODEL_GRADED_ASSERTION_TYPES,
  'classifier',
  'conversation-relevance',
  'g-eval',
  'moderation',
  'select-best',
  'similar',
]);

export function usesGradingProvider(assertionType: string): boolean {
  const type = assertionType.replace(/^not-/, '');
  return (
    PROVIDER_GRADED_ASSERTION_TYPES.has(type) ||
    type.startsWith('similar:') ||
    type.startsWith('promptfoo:redteam:')
  );
}
