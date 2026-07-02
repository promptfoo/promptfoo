import { isFunctionToolCallValidationSetupError } from '../contracts/providers';

import type { AssertionParams, GradingResult } from '../types/index';

const VALIDATION_FAILED_REASON = 'Function call validation failed';

function isAbortError(error: unknown): boolean {
  try {
    return (
      error instanceof Error && (error.name === 'AbortError' || error.name === 'AbortException')
    );
  } catch {
    return false;
  }
}

export function getValidationErrorMessage(error: unknown): string {
  try {
    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      message = error.message;
    } else {
      message = String(error ?? '');
    }
    return message.trim() ? message : VALIDATION_FAILED_REASON;
  } catch {
    return VALIDATION_FAILED_REASON;
  }
}

export const handleIsValidFunctionCall = async ({
  assertion,
  output,
  provider,
  test,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  let validateFunctionToolCall: unknown;
  try {
    validateFunctionToolCall = (provider as { validateFunctionToolCall?: unknown } | undefined)
      ?.validateFunctionToolCall;
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: getValidationErrorMessage(error),
      assertion,
    };
  }
  if (typeof validateFunctionToolCall !== 'function') {
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
    await validateFunctionToolCall.call(provider, output, test.vars);
    isValid = true;
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    invalidReason = getValidationErrorMessage(err);
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
