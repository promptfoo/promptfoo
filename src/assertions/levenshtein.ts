import { distance } from 'fastest-levenshtein';
import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';
import { coerceString } from './utils';

export function handleLevenshtein(
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
): GradingResult {
  invariant(
    typeof renderedValue === 'string',
    '"levenshtein" assertion type must have a string value',
  );
  const outputString = coerceString(output);
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
