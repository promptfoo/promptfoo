import { matchesSearchRubric } from '../matchers';
import { defineAssertions } from './assertionDefinition';

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

export const searchRubricDefinitions = defineAssertions({
  'search-rubric': {
    label: 'Search Rubric',
    description: 'Evaluates search/retrieval quality using LLM grading',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: handleSearchRubric,
  },
});
