import { matchesLlmRubric } from '../matchers';
import type { AssertionParams, GradingResult } from '../types/index';
import invariant from '../util/invariant';

export const handleLlmRubric = ({
  assertion,
  renderedValue,
  outputString,
  test,
  provider,
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

  // Prefer the provider passed in by runAssertions when test options don't explicitly set one.
  const optionsWithProvider = {
    ...test.options,
    ...(provider && !test.options?.provider ? { provider } : {}),
  } as any;

  return matchesLlmRubric(
    renderedValue || '',
    outputString,
    optionsWithProvider,
    test.vars,
    assertion,
  );
};
