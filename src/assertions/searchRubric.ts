import { isGraderFailure } from '../matchers/llmGrading';
import { matchesSearchRubric } from '../matchers/search';

import type { AssertionParams, GradingResult } from '../types/index';

export async function handleSearchRubric({
  assertion,
  baseType: _baseType,
  inverse,
  provider,
  providerCallContext,
  renderedValue,
  test,
  providerResponse,
}: AssertionParams): Promise<GradingResult> {
  if (renderedValue == null) {
    throw new Error('search-rubric assertion type must have a string value');
  }

  const result = await matchesSearchRubric(
    String(renderedValue),
    providerResponse.output,
    test.options,
    test.vars,
    assertion,
    provider,
    providerCallContext,
  );

  if (isGraderFailure(result)) {
    return result;
  }

  if (inverse) {
    result.pass = !result.pass;
    // Clamp only on inversion so a NaN or out-of-range grader score cannot
    // turn `1 - score` into a misleading negative/inflated value.
    result.score = Math.min(1, Math.max(0, 1 - (Number.isFinite(result.score) ? result.score : 0)));
    result.reason = result.pass
      ? `Output does not require web search verification: ${result.reason}`
      : `Output requires web search verification: ${result.reason}`;
  }

  return result;
}
