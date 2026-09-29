import { type TokenBudget, tokenBudgetError } from '../contracts/validators/usageAssertions';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleTokensUsed = (params: AssertionParams): GradingResult => {
  const value = params.renderedValue ?? params.assertion.value;
  const error = tokenBudgetError(value);
  if (error) {
    throw new Error(error);
  }
  const { min, max } = value as TokenBudget;
  const usage = params.providerResponse?.tokenUsage;
  let total = usage?.total;
  if (
    total === undefined &&
    usage &&
    Number.isSafeInteger(usage.prompt) &&
    Number.isSafeInteger(usage.completion) &&
    usage.prompt! >= 0 &&
    usage.completion! >= 0
  ) {
    total = usage.prompt! + usage.completion!;
  }
  if (total === undefined) {
    throw new Error(
      'tokens-used requires provider response total usage, or both prompt and completion usage.',
    );
  }
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('tokens-used requires non-negative integer response token usage.');
  }
  const inBudget = (min === undefined || total >= min) && (max === undefined || total <= max);
  const pass = inBudget !== params.inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: `Provider response used ${total} tokens; expected ${params.inverse ? 'outside' : 'within'} ${min ?? 0}–${max ?? 'unlimited'}.`,
    assertion: params.assertion,
  };
};
