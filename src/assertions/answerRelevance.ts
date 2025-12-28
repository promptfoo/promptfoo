import { matchesAnswerRelevance } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleAnswerRelevance = async ({
  assertion,
  output,
  prompt,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof output === 'string',
    'answer-relevance assertion type must evaluate a string output',
  );
  invariant(prompt, 'answer-relevance assertion type must have a prompt');
  const input = typeof test?.vars?.query === 'string' ? test.vars.query : prompt;

  return {
    assertion,
    ...(await matchesAnswerRelevance(
      input,
      output,
      assertion.threshold ?? 0,
      test.options,
      providerCallContext,
    )),
  };
};

export const answerRelevanceDefinitions = defineAssertions({
  'answer-relevance': {
    label: 'Answer Relevance',
    description: 'Evaluates if the answer is relevant to the question',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handleAnswerRelevance,
  },
});
