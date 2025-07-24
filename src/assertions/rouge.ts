import * as rouge from 'js-rouge';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types';

export function handleRougeScore({
  baseType,
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult {
  invariant(typeof renderedValue === 'string', '"rouge" assertion type must be a string value');
  const fnName = baseType[baseType.length - 1] as 'n' | 'l' | 's';
  const rougeMethod = rouge[fnName];
  const score = rougeMethod(outputString, renderedValue, {});
  const threshold = assertion.threshold ?? 0.75;
  const pass = score >= threshold != inverse;
  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? `${baseType.toUpperCase()} score ${score.toFixed(
          2,
        )} is greater than or equal to threshold ${threshold}`
      : `${baseType.toUpperCase()} score ${score.toFixed(2)} is less than threshold ${threshold}`,
    assertion,
  };
}
