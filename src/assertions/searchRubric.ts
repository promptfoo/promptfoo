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

  // A grader/transport error must never be flipped into a pass.
  // This mirrors the guard used in llmRubric.ts, geval.ts, moderation.ts, etc.
  if (isGraderFailure(result)) {
    return result;
  }

  if (inverse) {
    result.pass = !result.pass;
    result.reason = result.pass
      ? `Output does not require web search verification: ${result.reason}`
      : `Output requires web search verification: ${result.reason}`;
  }

  return result;
}
