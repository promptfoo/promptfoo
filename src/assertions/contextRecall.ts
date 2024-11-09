import invariant from 'tiny-invariant';
import { matchesContextRecall } from '../matchers';
import type { Assertion, AssertionValue, AtomicTestCase, GradingResult } from '../types';

export const handleContextRecall = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  prompt: string | undefined,
  test: AtomicTestCase,
): Promise<GradingResult> => {
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
