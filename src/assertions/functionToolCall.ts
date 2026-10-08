import { hasFunctionToolCallValidator } from '../contracts/providers';

import type { Assertion, AssertionParams, GradingResult } from '../types/index';

/** Builds a validation verdict, inverted for `not-` assertions. Not for configuration errors. */
export function toolCallVerdict(
  assertion: Assertion,
  inverse: boolean,
  valid: boolean,
  reason: string,
  label: string,
): GradingResult {
  const pass = inverse ? !valid : valid;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: inverse
      ? pass
        ? 'Assertion passed'
        : `Expected output to not be a valid ${label}`
      : reason,
    assertion,
  };
}

/** Verdict for a validator error. A tool schema error fails under `not-` too. */
export function toolCallErrorVerdict(
  assertion: Assertion,
  inverse: boolean,
  err: unknown,
  label: string,
): GradingResult {
  // Thrown by the provider validators when a tool schema does not compile.
  if (err instanceof Error && err.name === 'InvalidToolSchemaError') {
    return { pass: false, score: 0, reason: err.message, assertion };
  }
  return toolCallVerdict(assertion, inverse, false, (err as Error).message, label);
}

export const handleIsValidFunctionCall = ({
  assertion,
  inverse,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  // Without a validator there is no verdict to negate, so this fails under `not-` too.
  if (!hasFunctionToolCallValidator(provider)) {
    return {
      pass: false,
      score: 0,
      reason: 'Provider does not have functionality for checking function call.',
      assertion,
    };
  }
  try {
    provider.validateFunctionToolCall(output, test.vars);
    return toolCallVerdict(assertion, inverse, true, 'Assertion passed', 'function call');
  } catch (err) {
    return toolCallErrorVerdict(assertion, inverse, err, 'function call');
  }
};
