import { matchesContextRelevance } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { transform } from '../util/transform';

export const handleContextRelevance = async ({
  assertion,
  test,
  output,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  invariant(test.vars, 'context-relevance assertion type must have a vars object');
  invariant(
    typeof test.vars.query === 'string',
    'context-relevance assertion type must have a query var',
  );
  let contextVar: string | undefined = test.vars.context;
  if (assertion.contextTransform) {
    const transformed = await transform(assertion.contextTransform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
    invariant(
      typeof transformed === 'string',
      'context-relevance contextTransform must return a string',
    );
    contextVar = transformed;
  }
  invariant(
    typeof contextVar === 'string',
    'context-relevance assertion type must have a context var',
  );

  return {
    assertion,
    ...(await matchesContextRelevance(
      test.vars.query,
      contextVar,
      assertion.threshold ?? 0,
      test.options,
    )),
  };
};
