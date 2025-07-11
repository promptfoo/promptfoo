import { matchesResearchRubric } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleResearchRubric = async ({
  assertion,
  renderedValue,
  outputString,
  test,
  prompt,
  provider,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"research-rubric" assertion type must have a string or object value',
  );

  invariant(prompt, 'research-rubric assertion type must have a prompt');

  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;

  return matchesResearchRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    provider,
    prompt,
  );
};
