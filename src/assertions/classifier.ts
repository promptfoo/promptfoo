import invariant from 'tiny-invariant';
import { matchesClassification } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import { coerceString } from './utils';

export async function handleClassifier({
  assertion,
  renderedValue,
  output,
  test,
  inverse,
}: AssertionParams): Promise<GradingResult> {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
    '"classifier" assertion type must have a string value or be undefined',
  );
  const outputString = coerceString(output);

  // Assertion provider overrides test provider
  const classificationResult = await matchesClassification(
    renderedValue,
    outputString,
    assertion.threshold ?? 1,
    test.options,
  );

  if (inverse) {
    classificationResult.pass = !classificationResult.pass;
    classificationResult.score = 1 - classificationResult.score;
  }

  return {
    assertion,
    ...classificationResult,
  };
}
