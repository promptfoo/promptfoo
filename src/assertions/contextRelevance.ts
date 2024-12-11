import { matchesContextRelevance } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleContextRelevance = async ({
  assertion,
  test,
}: AssertionParams): Promise<GradingResult> => {
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
