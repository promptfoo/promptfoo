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

  // A grader/transport error must never be flipped into a pass.
  // This mirrors the guard used in llmRubric.ts, geval.ts, moderation.ts, etc.
  if (isGraderFailure(classificationResult)) {
    return { assertion, ...classificationResult };
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
