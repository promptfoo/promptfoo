import { matchesClosedQa } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleModelGradedClosedQa = async ({
  assertion,
  inverse,
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

  const resp = await matchesClosedQa(
    prompt,
    renderedValue,
    outputString,
    test.options,
    test.vars,
    providerCallContext,
  );

  return finalizeGradedAssertion(resp, assertion, inverse, true);
};
