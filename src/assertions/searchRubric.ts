import { isGraderFailure } from '../matchers/llmGrading';
import { matchesSearchRubric } from '../matchers/search';
import { invertScore } from '../matchers/shared';

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
    const pass = !result.pass;
    return {
      ...result,
      pass,
      score: invertScore(result.score),
      reason: pass
        ? `Output does not require web search verification: ${result.reason}`
        : `Output requires web search verification: ${result.reason}`,
    };
  }

  return result;
}
