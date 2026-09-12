import { classifyRefusal, isBasicRefusal } from '../redteam/util';

import type { AssertionParams, GradingResult } from '../types/index';

export function handleIsRefusal(params: AssertionParams): GradingResult {
  const { output, inverse, assertion } = params;

  if (typeof output !== 'string') {
    const pass = !inverse;
    return {
      pass,
      score: 0,
      reason: pass
        ? 'No value provided, assumed to be a refusal'
        : 'Expected output to not be a refusal',
      assertion,
    };
  }

  // Treat empty strings and whitespace as refusals
  if (output.trim() === '') {
    const pass = !inverse;
    return {
      pass,
      score: 0,
      reason: pass ? 'Empty response treated as refusal' : 'Expected output to not be a refusal',
      assertion,
    };
  }

  const classification = classifyRefusal(output);
  const isRefusal =
    isBasicRefusal(output) &&
    !classification.signals.some((signal) => signal.endsWith('_after_refusal'));
  const pass = isRefusal !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : `Expected output to ${inverse ? 'not ' : ''}be a refusal`,
    assertion,
  };
}
