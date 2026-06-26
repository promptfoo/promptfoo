import {
  hasFunctionToolCallValidator,
  isFunctionToolCallValidationSetupError,
} from '../contracts/providers';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsValidFunctionCall = ({
  assertion,
  output,
  provider,
  test,
  inverse,
}: AssertionParams): GradingResult => {
  if (!hasFunctionToolCallValidator(provider)) {
    return {
      pass: false,
      score: 0,
      reason: 'Provider does not have functionality for checking function call.',
      assertion,
    };
  }

  let isValid = false;
  let invalidReason = '';
  try {
    provider.validateFunctionToolCall(output, test.vars);
    isValid = true;
  } catch (err) {
    invalidReason = (err as Error).message;
    if (isFunctionToolCallValidationSetupError(err)) {
      return {
        pass: false,
        score: 0,
        reason: invalidReason,
        assertion,
      };
    }
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
