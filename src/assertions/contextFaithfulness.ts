import { matchesContextFaithfulness } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

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
    ...(await matchesContextFaithfulness(
      test.vars.query,
      output,
      context,
      assertion.threshold ?? 0,
      test.options,
    )),
  };
}
