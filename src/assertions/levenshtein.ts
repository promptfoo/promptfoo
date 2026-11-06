import { distance } from 'fastest-levenshtein';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export function handleLevenshtein({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult {
  invariant(
    typeof renderedValue === 'string' ||
      (typeof renderedValue === 'number' && Number.isFinite(renderedValue)),
    '"levenshtein" assertion type must have a string or finite number value',
  );
  const levDistance = distance(outputString, String(renderedValue));
  const threshold = assertion.threshold ?? 5;
  const pass = levDistance <= threshold !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Levenshtein distance ${levDistance} is ${
          inverse ? 'less than or equal to' : 'greater than'
        } threshold ${threshold}`,
    assertion,
  };
}
