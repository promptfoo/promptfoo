import { hasFunctionToolCallValidator } from '../contracts/providers';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsValidFunctionCall = ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  try {
    if (!hasFunctionToolCallValidator(provider)) {
      throw new Error(`Provider does not have functionality for checking function call.`);
    }
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
