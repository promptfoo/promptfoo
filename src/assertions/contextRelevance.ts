import invariant from 'tiny-invariant';
import { matchesContextRelevance } from '../matchers';
import type { Assertion, GradingResult, TestCase } from '../types';

export const handleContextRelevance = async (
  assertion: Assertion,
  test: TestCase,
): Promise<GradingResult> => {
  invariant(test.vars, 'context-relevance assertion type must have a vars object');
  invariant(
    typeof test.vars.query === 'string',
    'context-relevance assertion type must have a query var',
  );
  invariant(
    typeof test.vars.context === 'string',
    'context-relevance assertion type must have a context var',
  );

  return {
    assertion,
    ...(await matchesContextRelevance(
      test.vars.query,
      test.vars.context,
      assertion.threshold || 0,
      test.options,
    )),
  };
};
