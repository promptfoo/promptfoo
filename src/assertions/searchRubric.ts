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

  // A search-rubric provider/transport error is not evidence about the
  // content, so never flip it into a pass for `not-search-rubric` — propagate
  // it verbatim (mirrors the inverse-aware llm-rubric/g-eval/moderation/
  // classifier handlers).
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
