import { matchesCitationFaithfulness, matchesContextFaithfulness } from '../matchers/rag';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';
import { applyRagInverse, DEFAULT_RAG_ASSERTION_THRESHOLD } from './ragDefaults';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Handles context-faithfulness assertions by evaluating whether the LLM output
 * is faithful to the provided context without hallucinations.
 *
 * Supports extracting context from provider responses using contextTransform
 * or from test variables.
 *
 * @param params - Assertion parameters including test case, output, and configuration
 * @returns Promise resolving to grading result with pass/fail and score
 */
export async function handleContextFaithfulness({
  assertion,
  test,
  output,
  prompt,
  providerResponse,
  providerCallContext,
  inverse,
}: AssertionParams): Promise<GradingResult> {
  invariant(test.vars, 'context-faithfulness assertion requires a test with variables');
  invariant(
    typeof test.vars.query === 'string',
    'context-faithfulness assertion requires a "query" variable with the user question',
  );
  invariant(
    typeof output === 'string',
    'context-faithfulness assertion requires string output from the provider',
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
    ...applyRagInverse(
      await matchesContextFaithfulness(
        test.vars.query,
        output,
        context,
        assertion.threshold ?? DEFAULT_RAG_ASSERTION_THRESHOLD,
        test.options,
        test.vars,
        providerCallContext,
      ),
      inverse,
    ),
    metadata: {
      context,
    },
  };
}

/**
 * Handles citation-faithfulness assertions by checking citation attribution:
 * whether every `[N]` citation marker in the output points to a passage that
 * actually supports the specific claim it is attached to.
 *
 * This differs from context-faithfulness, which only checks whether a claim is
 * supported by the context somewhere. Citation-faithfulness catches
 * misattribution: a claim cited to passage [A] that does not support it, even
 * when another passage [B] in the context would.
 *
 * Supports extracting context from provider responses using contextTransform or
 * from test variables. Provide context as an array of strings so each entry is
 * numbered ([1], [2], ...) for the grader to resolve citation markers.
 *
 * @param params - Assertion parameters including test case, output, and configuration
 * @returns Promise resolving to grading result with pass/fail and score
 */
export async function handleCitationFaithfulness({
  assertion,
  test,
  output,
  prompt,
  inverse,
  providerResponse,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> {
  invariant(test.vars, 'citation-faithfulness assertion requires a test with variables');
  invariant(
    typeof test.vars.query === 'string',
    'citation-faithfulness assertion requires a "query" variable with the user question',
  );
  invariant(
    typeof output === 'string',
    'citation-faithfulness assertion requires string output from the provider',
  );

  const context = await resolveContext(
    assertion,
    test,
    output,
    prompt,
    undefined,
    providerResponse,
  );

  // For `not-citation-faithfulness`, `applyRagInverse` flips the verdict: it passes
  // when the answer IS misattributed and fails when every citation is faithful. It
  // leaves hard grader failures (outage/parse error) alone — those should fail either
  // polarity rather than letting an error satisfy the negative assertion.
  const result = applyRagInverse(
    await matchesCitationFaithfulness(
      test.vars.query,
      output,
      context,
      assertion.threshold ?? 1,
      test.options,
      test.vars,
      providerCallContext,
    ),
    inverse,
  );

  return {
    assertion,
    ...result,
    metadata: {
      ...result.metadata,
      context,
    },
  };
}
