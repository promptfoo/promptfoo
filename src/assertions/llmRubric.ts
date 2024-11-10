import invariant from 'tiny-invariant';
import { matchesLlmRubric } from '../matchers';
import type { Assertion, AssertionValue, AtomicTestCase, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleLlmRubric = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  test: AtomicTestCase,
): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
    '"llm-rubric" assertion type must have a string value',
  );
  const outputString = coerceString(output);
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;
  return {
    assertion,
    ...(await matchesLlmRubric(renderedValue || '', outputString, test.options, test.vars)),
  };
};
