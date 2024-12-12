import { distance } from 'fastest-levenshtein';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export function handleLevenshtein({
  assertion,
  renderedValue,
  outputString,
}: AssertionParams): GradingResult {
  invariant(
    typeof renderedValue === 'string',
    '"levenshtein" assertion type must have a string value',
  );
  const levDistance = distance(outputString, renderedValue);
  const pass = levDistance <= (assertion.threshold || 5);
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Levenshtein distance ${levDistance} is greater than threshold ${assertion.threshold || 5}`,
    assertion,
  };
}
