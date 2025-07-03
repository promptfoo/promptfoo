import { matchesContextRelevance } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

/**
 * Handles context-relevance assertions by evaluating whether the provided context
 * is relevant to the given query/question.
 *
 * Supports extracting context from provider responses using contextTransform
 * or from test variables.
 *
 * @param params - Assertion parameters including test case, output, and configuration
 * @returns Promise resolving to grading result with pass/fail and score
 */
export const handleContextRelevance = async ({
  assertion,
  test,
  output,
  prompt,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  invariant(test.vars, 'context-relevance assertion requires a test with variables');
  invariant(
    typeof test.vars.query === 'string',
    'context-relevance assertion requires a "query" variable with the user question',
  );

  const context = await resolveContext(
    assertion,
    test,
    output,
    prompt,
    undefined,
    providerResponse,
  );

  return {
    assertion,
    ...(await matchesContextRelevance(
      test.vars.query,
      context,
      assertion.threshold ?? 0,
      test.options,
    )),
  };
};
