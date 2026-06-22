import { hasFunctionToolCallValidator } from '../contracts/providers';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsValidFunctionCall = ({
  assertion,
  output,
  provider,
  test,
  inverse,
}: AssertionParams): GradingResult => {
  let isValid = false;
  let invalidReason = '';
  try {
    if (!hasFunctionToolCallValidator(provider)) {
      throw new Error(`Provider does not have functionality for checking function call.`);
    }
    provider.validateFunctionToolCall(output, test.vars);
    isValid = true;
  } catch (err) {
    invalidReason = (err as Error).message;
  }

  const pass = inverse ? !isValid : isValid;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : inverse
        ? 'Expected output to not be a valid function call, but it was'
        : invalidReason,
    assertion,
  };
};
