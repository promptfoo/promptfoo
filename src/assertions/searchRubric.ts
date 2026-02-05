import { matchesSearchRubric } from '../matchers';

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

  if (inverse) {
    result.pass = !result.pass;
    result.reason = result.pass
      ? `Output does not require web search verification: ${result.reason}`
      : `Output requires web search verification: ${result.reason}`;
  }

  return result;
}
