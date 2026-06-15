import * as rouge from 'js-rouge';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

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
  // Score case-insensitively, matching the other text-overlap metrics
  // (bleu/gleu/meteor all lowercase their inputs). js-rouge defaults to
  // caseSensitive: true, which would score e.g. "The CAT" vs "the cat" as 0.
  const score = rougeMethod(outputString, renderedValue, { caseSensitive: false });
  const threshold = assertion.threshold ?? 0.75;
  const pass = score >= threshold !== inverse;
  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: `${baseType.toUpperCase()} score ${score.toFixed(2)} is ${
      score >= threshold ? 'greater than or equal to' : 'less than'
    } threshold ${threshold}`,
    assertion,
  };
}
