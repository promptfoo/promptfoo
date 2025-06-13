import { matchesContextRecall } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { transform } from '../util/transform';

export const handleContextRecall = async ({
  assertion,
  renderedValue,
  prompt,
  test,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'context-recall assertion type must have a string value',
  );
  invariant(prompt, 'context-recall assertion type must have a prompt');
  let contextVar: string | undefined =
    typeof test.vars?.context === 'string' ? test.vars.context : prompt;
  if (assertion.contextTransform) {
    const transformed = await transform(assertion.contextTransform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
    invariant(
      typeof transformed === 'string',
      'context-recall contextTransform must return a string',
    );
    contextVar = transformed;
  }
  return {
    assertion,
    ...(await matchesContextRecall(
      contextVar,
      renderedValue,
      assertion.threshold ?? 0,
      test.options,
      test.vars,
    )),
  };
};
