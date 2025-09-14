import { matchesLlmRubric } from '../matchers.js';
import invariant from '../util/invariant.js';

import type { AssertionParams, GradingResult } from '../types/index.js';

export const handleLlmRubric = ({
  assertion,
  renderedValue,
  outputString,
  test,
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
  return matchesLlmRubric(renderedValue || '', outputString, test.options, test.vars, assertion);
};
