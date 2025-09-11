import { matchesFactuality } from '../matchers';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types';

export const handleFactuality = async ({
  assertion,
  renderedValue,
  outputString,
  test,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesFactuality with proper variables
  // (input, ideal, completion) available at that point

  return {
    assertion,
    ...(await matchesFactuality(prompt, renderedValue, outputString, test.options, test.vars)),
  };
};
