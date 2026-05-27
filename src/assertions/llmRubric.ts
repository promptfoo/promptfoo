import { isGraderFailure, matchesLlmRubric } from '../matchers/llmGrading';
import {
  appendSafeControlGradingInstructions,
  applySafeControlContext,
} from '../redteam/shared/safeControls';
import invariant from '../util/invariant';

import type { SafeControlContext } from '../redteam/shared/safeControls';
import type { AssertionParams, GradingResult, PluginConfig } from '../types/index';

export const handleLlmRubric = async ({
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
    '"llm-rubric" assertion type must have a string or object value',
  );
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;

  const safeControlConfig = assertion.config?.redteamSafeControl as
    | { context?: SafeControlContext; pluginConfig?: PluginConfig }
    | undefined;
  let rubric = renderedValue || '';
  if (safeControlConfig) {
    invariant(typeof rubric === 'string', 'Safe control rubric must have a string value');
    rubric = applySafeControlContext(rubric, safeControlConfig.context);
    rubric = appendSafeControlGradingInstructions(
      rubric,
      safeControlConfig.pluginConfig,
      test.options?.redteamGraderExamples as PluginConfig['graderExamples'] | undefined,
    );
  }

  const resp = await matchesLlmRubric(
    rubric,
    outputString,
    test.options,
    test.vars,
    assertion,
    undefined,
    providerCallContext,
  );
  const metadata = safeControlConfig?.context
    ? { ...resp.metadata, renderedAssertionValue: rubric as string }
    : resp.metadata;

  if (isGraderFailure(resp)) {
    return { ...resp, assertion, ...(metadata ? { metadata } : {}) };
  }

  // Clamp only on inversion so a NaN or out-of-range grader score cannot turn
  // `1 - score` into a misleading negative/inflated value.
  const score = inverse
    ? Math.min(1, Math.max(0, 1 - (Number.isFinite(resp.score) ? resp.score : 0)))
    : resp.score;
  return {
    ...resp,
    ...(metadata ? { metadata } : {}),
    pass: resp.pass !== inverse,
    score,
  };
};
