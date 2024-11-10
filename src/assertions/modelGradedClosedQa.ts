import invariant from 'tiny-invariant';
import { matchesClosedQa } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import { getNunjucksEngine } from '../util/templates';
import { coerceString } from './utils';

const nunjucks = getNunjucksEngine();

export const handleModelGradedClosedQa = async ({
  assertion,
  renderedValue,
  output,
  test,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'model-graded-closedqa assertion type must have a string value',
  );
  invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');
  const outputString = coerceString(output);

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
