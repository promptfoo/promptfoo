import { matchesLlmRubric } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleLlmRubric = ({
  assertion,
  renderedValue,
  outputString,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"llm-rubric" assertion type must have a string or object value',
  );
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;

  return matchesLlmRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    undefined,
    providerCallContext,
  );
};

export const llmRubricDefinitions = defineAssertions({
  'llm-rubric': {
    label: 'LLM Rubric',
    description: 'AI evaluates output against custom criteria',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: handleLlmRubric,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs#llm-rubric',
  },
});
