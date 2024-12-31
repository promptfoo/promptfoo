import { matchesContextRecall } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleContextRecall = async ({
  assertion,
  renderedValue,
  prompt,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'context-recall assertion type must have a string value',
  );
  invariant(prompt, 'context-recall assertion type must have a prompt');
  return {
    assertion,
    ...(await matchesContextRecall(
      typeof test.vars?.context === 'string' ? test.vars.context : prompt,
      renderedValue,
      assertion.threshold || 0,
      test.options,
      test.vars,
    )),
  };
};
