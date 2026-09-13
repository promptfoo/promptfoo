import { hasFunctionToolCallValidator } from '../contracts/providers';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsValidFunctionCall = ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  if (!hasFunctionToolCallValidator(provider)) {
    return {
      pass: false,
      score: 0,
      reason: 'Provider does not have functionality for checking function call.',
      assertion,
      metadata: { assertionError: true },
    };
  }

  try {
    provider.validateFunctionToolCall(output, test.vars);
    return {
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion,
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: (err as Error).message,
      assertion,
    };
  }
};
