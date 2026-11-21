import { matchesAgentRubric } from '../matchers/agent';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleAgentRubric = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  test,
  providerCallContext,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"agent-rubric" assertion type must have a string or object value',
  );
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  assertion.value = assertion.value || test.options?.rubricPrompt;

  const resp = await matchesAgentRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    providerCallContext,
    providerResponse?.metadata?.workingDir,
  );

  return finalizeGradedAssertion(resp, assertion, inverse);
};
