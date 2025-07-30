import { matchesWebSearch } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';

export async function handleWebSearch({
  assertion,
  baseType,
  inverse,
  provider,
  renderedValue,
  test,
  providerResponse,
}: AssertionParams): Promise<GradingResult> {
  if (renderedValue == null) {
    throw new Error('web-search assertion type must have a string value');
  }

  const result = await matchesWebSearch(
    String(renderedValue),
    providerResponse.output,
    test.options,
    test.vars,
    assertion,
    provider,
  );

  if (inverse) {
    result.pass = !result.pass;
    result.reason = result.pass
      ? `Output does not require web search verification: ${result.reason}`
      : `Output requires web search verification: ${result.reason}`;
  }

  return result;
}
