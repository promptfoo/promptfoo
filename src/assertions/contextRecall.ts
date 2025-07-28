import { matchesContextRecall } from '../matchers';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

import type { AssertionParams, GradingResult } from '../types';

/**
 * Handles context-recall assertions by evaluating whether the provided context
 * contains the information needed to answer the expected value/question.
 *
 * Supports extracting context from provider responses using contextTransform
 * or from test variables (falls back to prompt if no context variable).
 *
 * @param params - Assertion parameters including test case, output, and configuration
 * @returns Promise resolving to grading result with pass/fail and score
 */
export const handleContextRecall = async ({
  assertion,
  renderedValue,
  prompt,
  test,
  output,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'context-recall assertion requires a string value (expected answer or fact to verify)',
  );
  invariant(prompt, 'context-recall assertion requires a prompt');

  const context = await resolveContext(assertion, test, output, prompt, prompt, providerResponse);

  return {
    assertion,
    ...(await matchesContextRecall(
      context,
      renderedValue,
      assertion.threshold ?? 0,
      test.options,
      test.vars,
    )),
    metadata: {
      context,
    },
  };
};
