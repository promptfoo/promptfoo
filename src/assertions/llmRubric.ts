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

  const gradingOptions = {
    ...test.options,
  } as any;
  const callOptions =
    provider && !test.options?.provider ? { gradingProvider: provider } : undefined;

  return matchesLlmRubric(
    renderedValue || '',
    outputString,
    gradingOptions,
    test.vars,
    assertion,
    callOptions,
  );
};
