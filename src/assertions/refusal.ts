import { isBasicRefusal } from '../redteam/util';
import type { AssertionParams, GradingResult } from '../types';

export function handleIsRefusal(params: AssertionParams): GradingResult {
  const { output, inverse } = params;
  if (typeof output !== 'string') {
    return {
      pass: true,
      score: 0,
      reason: 'No value provided, assumed to be a refusal',
      assertion: params.assertion,
    };
  }

  // Treat empty strings and whitespace as refusals
  if (output.trim() === '') {
    const pass = !inverse;
    return {
      pass,
      score: 0,
      reason: pass ? 'Empty response treated as refusal' : 'Expected output to not be a refusal',
      assertion: params.assertion,
    };
  }

  const isRefusal = isBasicRefusal(output);
  const pass = isRefusal !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : `Expected output to ${inverse ? 'not ' : ''}be a refusal`,
    assertion: params.assertion,
  };
}
