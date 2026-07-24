import { matchesContextRelevance } from '../matchers/rag';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';
import { DEFAULT_RAG_ASSERTION_THRESHOLD } from './ragDefaults';

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
    (assertion.threshold as number) ?? DEFAULT_RAG_ASSERTION_THRESHOLD,
    test.options,
    providerCallContext,
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
