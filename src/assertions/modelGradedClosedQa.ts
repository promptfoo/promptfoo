import invariant from 'tiny-invariant';
import { matchesClosedQa } from '../matchers';
import type { Assertion, AssertionValue, AtomicTestCase, GradingResult } from '../types';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

export const handleModelGradedClosedQa = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  outputString: string,
  test: AtomicTestCase,
  prompt: string | undefined,
): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'model-graded-closedqa assertion type must have a string value',
  );
  invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');

  if (test.options?.rubricPrompt) {
    // Substitute vars in prompt
    invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
    test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
  }

  return {
    assertion,
    ...(await matchesClosedQa(prompt, renderedValue, outputString, test.options, test.vars)),
  };
};
