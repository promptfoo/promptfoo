import { matchesContextFaithfulness } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { transform } from '../util/transform';

export async function handleContextFaithfulness({
  assertion,
  test,
  output,
  prompt,
}: AssertionParams): Promise<GradingResult> {
  invariant(test.vars, 'context-faithfulness assertion type must have a vars object');
  invariant(
    typeof test.vars.query === 'string',
    'context-faithfulness assertion type must have a query var',
  );
  invariant(
    typeof output === 'string',
    'context-faithfulness assertion type must have a string output',
  );

  let contextVar: string | undefined = test.vars.context;
  if (assertion.contextTransform) {
    const transformed = await transform(assertion.contextTransform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
    invariant(
      typeof transformed === 'string',
      'context-faithfulness contextTransform must return a string',
    );
    contextVar = transformed;
  }
  invariant(
    typeof contextVar === 'string',
    'context-faithfulness assertion type must have a context var',
  );

  return {
    assertion,
    ...(await matchesContextFaithfulness(
      test.vars.query,
      output,
      contextVar,
      assertion.threshold ?? 0,
      test.options,
    )),
  };
}
