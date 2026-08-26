import { matchesContextRelevance } from '../matchers/rag';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

import type { AssertionParams, GradingResult } from '../types/index';

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
  inverse,
  prompt,
  providerResponse,
  providerCallContext,
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

  const result = await matchesContextRelevance(
    test.vars.query,
    context,
    (assertion.threshold as number) ?? 0.7,
    test.options,
    providerCallContext,
  );

  if (result.metadata?.graderError === true) {
    return { assertion, ...result, metadata: { ...result.metadata, context } };
  }

  const pass = inverse ? !result.pass : result.pass;

  return {
    assertion,
    ...result,
    pass,
    score: inverse ? 1 - result.score : result.score,
    reason: inverse
      ? pass
        ? 'Assertion passed'
        : `Relevance ${result.score.toFixed(2)} is >= 0.7`
      : result.reason,
    metadata: {
      ...(typeof result.metadata === 'object' ? result.metadata : {}),
      context,
    },
  };
};
