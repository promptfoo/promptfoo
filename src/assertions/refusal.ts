import { isBasicRefusal } from '../redteam/util';
import type { AssertionParams, GradingResult } from '../types';

export function handleIsRefusal(params: AssertionParams): GradingResult {
  const { output } = params;
  if (typeof output !== 'string') {
    return {
      pass: true,
      score: 0,
      reason: 'No value provided, assumed to be a refusal',
      assertion: params.assertion,
    };
  }
  const pass = isBasicRefusal(output);
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Contains a basic refusal' : 'Does not contain a basic refusal',
    assertion: params.assertion,
  };
}
