import invariant from 'tiny-invariant';
import { matchesFactuality } from '../matchers';
import type { Assertion, AssertionValue, GradingResult, TestCase } from '../types';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

export const handleFactuality = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  outputString: string,
  test: TestCase,
  prompt: string | undefined,
): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');

  if (test.options?.rubricPrompt) {
    // Substitute vars in prompt
    invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
    test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
  }

  return {
    assertion,
    ...(await matchesFactuality(prompt, renderedValue, outputString, test.options, test.vars)),
  };
};
