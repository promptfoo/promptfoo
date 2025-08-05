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

  // RAGAS context-recall checks if ground truth (renderedValue) can be attributed to context
  const result = await matchesContextRecall(
    context, // context parameter (used as {{context}} in prompt)
    renderedValue, // ground truth parameter (used as {{groundTruth}} in prompt)
    assertion.threshold ?? 0,
    test.options,
    test.vars,
  );

  return {
    assertion,
    ...result,
    metadata: {
      context,
      ...(result.metadata || {}),
    },
  };
};
