import { matchesFactuality } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleFactuality = async ({
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
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesFactuality with proper variables
  // (input, ideal, completion) available at that point

  const resp = await matchesFactuality(
    prompt,
    renderedValue,
    outputString,
    test.options,
    test.vars,
    providerCallContext,
  );

  return finalizeGradedAssertion(resp, assertion, inverse, true);
};
