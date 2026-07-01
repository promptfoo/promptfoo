import { matchesContextFaithfulness } from '../matchers/rag';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

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

  const threshold = assertion.threshold ?? 0.7;

  const result = await matchesContextFaithfulness(
    test.vars.query,
    output,
    context,
    threshold,
    test.options,
    test.vars,
    providerCallContext,
  );

  // `not-context-faithfulness` routes to this handler with `inverse: true`. The
  // matcher already applied the threshold (`pass` is true when faithfulness is
  // above it), so invert its verdict for the `not-` variant: an unfaithful
  // answer (faithfulness below the threshold) should pass the inverted
  // assertion. This mirrors the other matcher-based assertions (meteor, gleu).
  const pass = inverse ? !result.pass : result.pass;

  return {
    assertion,
    ...result,
    pass,
    score: inverse ? 1 - result.score : result.score,
    reason: inverse
      ? pass
        ? 'Assertion passed'
        : `Faithfulness ${result.score.toFixed(2)} is >= ${threshold}`
      : result.reason,
    metadata: {
      context,
    },
  };
}
