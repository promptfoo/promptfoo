import { matchesPiScore } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export const handlePiScorer = async ({
  assertion,
  prompt,
  renderedValue,
  outputString,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', '"pi" assertion type must have a string value');
  invariant(typeof prompt === 'string', '"pi" assertion must have a prompt that is a string');
  return matchesPiScore(renderedValue, prompt, outputString, assertion);
};

export const piDefinitions = defineAssertions({
  pi: {
    label: 'Pi Labs Scorer',
    description: 'Pi Labs preference scoring model for evaluating output quality',
    tags: ['ai-evaluation', 'external'],
    valueType: 'text',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handlePiScorer,
  },
});
