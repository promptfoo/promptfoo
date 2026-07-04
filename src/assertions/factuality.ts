import { matchesFactuality } from '../matchers/llmGrading';
import { type AssertionParams, type GradingResult, getGraderVars } from '../types/index';
import invariant from '../util/invariant';

export const handleFactuality = async ({
  assertion,
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

  return {
    assertion,
    ...(await matchesFactuality(
      prompt,
      renderedValue,
      outputString,
      test.options,
      getGraderVars(assertion, test.vars),
      providerCallContext,
    )),
  };
};
