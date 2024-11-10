import * as rouge from 'js-rouge';
import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';

export function handleRougeScore(
  baseType: 'rouge-n',
  assertion: Assertion,
  expected: AssertionValue | undefined,
  output: string,
  inverted: boolean,
): GradingResult {
  invariant(typeof expected === 'string', '"rouge" assertion type must be a string value');
  const fnName = baseType[baseType.length - 1] as 'n' | 'l' | 's';
  const rougeMethod = rouge[fnName];
  const score = rougeMethod(output, expected, {});
  const pass = score >= (assertion.threshold || 0.75) != inverted;

  return {
    pass,
    score: inverted ? 1 - score : score,
    reason: pass
      ? `${baseType.toUpperCase()} score ${score.toFixed(
          2,
        )} is greater than or equal to threshold ${assertion.threshold || 0.75}`
      : `${baseType.toUpperCase()} score ${score.toFixed(2)} is less than threshold ${
          assertion.threshold || 0.75
        }`,
    assertion,
  };
}
