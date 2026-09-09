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

  // A classification provider/transport error is not evidence about the
  // content, so never flip it into a pass for `not-classifier` — propagate it
  // verbatim (mirrors the inverse-aware llm-rubric/g-eval/moderation handlers).
  if (isGraderFailure(classificationResult)) {
    return { ...classificationResult, assertion };
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
