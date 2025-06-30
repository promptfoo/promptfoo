import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export function handleFinishReason({
  assertion,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;
  invariant(typeof value === 'string', '"finish-reason" assertion type must have a string value');

  if (!providerResponse.finishReason) {
    return {
      pass: false,
      score: 0,
      reason: 'Provider did not supply stop/finish reason',
      assertion,
    };
  }

  // Case-insensitive comparison to be more user-friendly
  const normalizedValue = value.toLowerCase();
  const normalizedFinishReason = providerResponse.finishReason.toLowerCase();
  const pass = normalizedValue === normalizedFinishReason;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected finish reason "${value}" but got "${providerResponse.finishReason}"`,
    assertion,
  };
}
