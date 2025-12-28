import { matchesClosedQa } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleModelGradedClosedQa = async ({
  assertion,
  renderedValue,
  outputString,
  test,
  prompt,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'model-graded-closedqa assertion type must have a string value',
  );
  invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesClosedQa with proper variables
  // (input, criteria, completion) available at that point

  return {
    assertion,
    ...(await matchesClosedQa(
      prompt,
      renderedValue,
      outputString,
      test.options,
      test.vars,
      providerCallContext,
    )),
  };
};

export const modelGradedClosedQaDefinitions = defineAssertions({
  'model-graded-closedqa': {
    label: 'Closed QA',
    description: 'Grades answer correctness for closed-domain questions',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: handleModelGradedClosedQa,
  },
});
