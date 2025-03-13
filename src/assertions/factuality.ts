import { matchesFactuality } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';

export const handleFactuality = async ({
  assertion,
  renderedValue,
  outputString,
  test,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');
  if (test.options?.rubricPrompt) {
    // Substitute vars in prompt
    invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
    const nunjucks = getNunjucksEngine();
    test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
  }

  return {
    assertion,
    ...(await matchesFactuality(prompt, renderedValue, outputString, test.options, test.vars)),
  };
};
