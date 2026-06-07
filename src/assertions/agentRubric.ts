import { matchesAgentRubric } from '../matchers/agent';
import { isGraderFailure } from '../matchers/llmGrading';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleAgentRubric = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  test,
  providerCallContext,
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
  );

  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  const score = inverse
    ? Math.min(1, Math.max(0, 1 - (Number.isFinite(resp.score) ? resp.score : 0)))
    : resp.score;
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score,
  };
};
