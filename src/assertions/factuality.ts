import { matchesFactuality } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleFactuality = async ({
  assertion,
  renderedValue,
  outputString,
  test,
  prompt,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesFactuality with proper variables
  // (input, ideal, completion) available at that point

  return {
    assertion,
    ...(await matchesFactuality(
      prompt,
      renderedValue,
      outputString,
      test.options,
      test.vars,
      providerCallContext,
    )),
  };
};

export const factualityDefinitions = defineAssertions({
  factuality: {
    label: 'Factuality',
    description: 'Checks if output is factually consistent with context',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: handleFactuality,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs#factuality',
  },
  'model-graded-factuality': {
    label: 'Model-Graded Factuality',
    description: 'Uses LLM to grade factual accuracy of output',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: handleFactuality,
  },
});
