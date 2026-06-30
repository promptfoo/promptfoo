import { matchesAgentRubric } from '../matchers/agent';
import { isGraderFailure } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { renderProviderConfigTemplates } from './utils';

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

  // Render `{{var}}` templates in the grading provider's config (e.g. `working_dir`)
  // so that batch evaluations can bind a per-test-case workspace from `test.vars`.
  // Only applied to `agent-rubric` to keep the change scoped.
  // See: https://github.com/promptfoo/promptfoo/issues/9915
  const renderedOptions = test.options
    ? { ...test.options, provider: renderProviderConfigTemplates(test.options.provider, test.vars) }
    : test.options;

  const resp = await matchesAgentRubric(
    renderedValue || '',
    outputString,
    renderedOptions,
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
