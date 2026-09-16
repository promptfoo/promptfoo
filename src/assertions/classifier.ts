import { matchesClassification } from '../matchers/classification';
import { isGraderFailure } from '../matchers/llmGrading';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export async function handleClassifier({
  assertion,
  renderedValue,
  outputString,
  test,
  inverse,
}: AssertionParams): Promise<GradingResult> {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
    '"classifier" assertion type must have a string value or be undefined',
  );
  // Assertion provider overrides test provider
  const classificationResult = await matchesClassification(
    renderedValue,
    outputString,
    (assertion.threshold as number) ?? 1,
    test.options,
  );

  if (isGraderFailure(classificationResult)) {
    // A broken grader is not evidence the criterion was or was not met; never
    // invert a transport/parse failure into a pass.
    return {
      assertion,
      ...classificationResult,
    };
  }

  if (inverse) {
    classificationResult.pass = !classificationResult.pass;
    classificationResult.score = 1 - classificationResult.score;
  }

  return {
    assertion,
    ...classificationResult,
  };
}
