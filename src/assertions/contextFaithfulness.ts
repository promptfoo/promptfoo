import invariant from 'tiny-invariant';
import { matchesContextFaithfulness } from '../matchers';
import type { Assertion, GradingResult, TestCase } from '../types';

export async function handleContextFaithfulness(
  assertion: Assertion,
  test: TestCase,
  output: string,
): Promise<GradingResult> {
  invariant(test.vars, 'context-faithfulness assertion type must have a vars object');
  invariant(
    typeof test.vars.query === 'string',
    'context-faithfulness assertion type must have a query var',
  );
  invariant(
    typeof test.vars.context === 'string',
    'context-faithfulness assertion type must have a context var',
  );
  invariant(
    typeof output === 'string',
    'context-faithfulness assertion type must have a string output',
  );

  return {
    assertion,
    ...(await matchesContextFaithfulness(
      test.vars.query,
      output,
      test.vars.context,
      assertion.threshold || 0,
      test.options,
    )),
  };
}
