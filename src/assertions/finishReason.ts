import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export function handleFinishReason({
  assertion,
  inverse = false,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;
  invariant(typeof value === 'string', '"finish-reason" assertion type must have a string value');

  if (!providerResponse.finishReason) {
    const pass = !!inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : 'Provider did not supply stop/finish reason',
      assertion,
    };
  }

  // Case-insensitive comparison to be more user-friendly
  const normalizedValue = value.toLowerCase();
  const normalizedFinishReason = providerResponse.finishReason.toLowerCase();
  const pass = (normalizedValue === normalizedFinishReason) !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected finish reason ${inverse ? 'not ' : ''}"${value}" but got "${providerResponse.finishReason}"`,
    assertion,
  };
}
