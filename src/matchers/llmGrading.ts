import cliState from '../cliState';
import logger from '../logger';
import {
  DEFAULT_GRADING_PROMPT,
  GEVAL_PROMPT_EVALUATE,
  GEVAL_PROMPT_STEPS,
  OPENAI_CLOSED_QA_PROMPT,
  PROMPTFOO_FACTUALITY_PROMPT,
  TRAJECTORY_GOAL_SUCCESS_PROMPT,
} from '../prompts/index';
import { getDefaultProviders } from '../providers/defaults';
import { shouldGenerateRemote } from '../redteam/remoteGeneration';
import { doRemoteGrading } from '../remoteGrading';
import { doRemoteScoringWithPi } from '../remoteScoring';
import invariant from '../util/invariant';
import { extractFirstJsonObject } from '../util/json';
import { accumulateTokenUsage } from '../util/tokenUsageUtils';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import {
  LlmRubricProviderError,
  loadRubricPrompt,
  renderLlmRubricPrompt,
  runJsonGradingPrompt,
} from './rubric';
import { fail, normalizeMatcherTokenUsage, tryParse } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderResponse,
  VarValue,
} from '../types/index';

type LlmRubricGradingConfig = GradingConfig & {
  __promptfooPreferRemote?: boolean;
};

const FACTUALITY_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  A: 'The submitted answer is a subset of the expert answer and is fully consistent with it.',
  B: 'The submitted answer is a superset of the expert answer and is fully consistent with it.',
  C: 'The submitted answer contains all the same details as the expert answer.',
  D: 'There is a disagreement between the submitted answer and the expert answer.',
  E: "The answers differ, but these differences don't matter from the perspective of factuality.",
};

function getFactualityScoreLookup(grading: GradingConfig): Record<string, number> {
  return {
    A: grading.factuality?.subset ?? 1,
    B: grading.factuality?.superset ?? 1,
    C: grading.factuality?.agree ?? 1,
    D: grading.factuality?.disagree ?? 0,
    E: grading.factuality?.differButFactual ?? 1,
  };
}

function buildFactualityResult(
  option: string,
  reason: string,
  grading: GradingConfig,
  resp: ProviderResponse,
): Omit<GradingResult, 'assertion'> {
  const scoreLookup = getFactualityScoreLookup(grading);
  const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
  const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);
  const pass = passing.includes(option) && !failing.includes(option);
  const score = scoreLookup[option] ?? (pass ? 1 : 0);

  return {
    pass,
    score,
    reason,
    tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage),
  };
}

function parseFactualityJsonResponse(
  responseText: string,
): { option: string; reason: string } | undefined {
  try {
    const jsonData = extractFirstJsonObject<{ category?: string; reason?: string }>(responseText);
    if (!jsonData?.category || typeof jsonData.category !== 'string') {
      return undefined;
    }

    const option = jsonData.category.trim().toUpperCase();
    if (!/^[A-E]$/.test(option)) {
      throw new Error(`Invalid category value: ${option}`);
    }

    return {
      option,
      reason:
        jsonData.reason?.trim() ||
        `Category ${option}: ${FACTUALITY_CATEGORY_DESCRIPTIONS[option]}`,
    };
  } catch (err) {
    const error = err as Error;
    if (error.message.startsWith('Invalid category value:')) {
      throw error;
    }
    logger.debug(`JSON parsing failed: ${error.message}`);
    return undefined;
  }
}

function parseLegacyFactualityResponse(responseText: string): { option: string; reason: string } {
  const answerMatch = responseText.match(/\s*\(?([a-eA-E])\)/);
  if (!answerMatch) {
    throw new Error(`Factuality checker output did not match expected format: ${responseText}`);
  }

  const option = answerMatch[1].toUpperCase();
  const reasonMatch = responseText.match(/\)\s*(.*)/s);

  return {
    option,
    reason: reasonMatch?.[1] ? reasonMatch[1].trim() : responseText,
  };
}

export async function matchesLlmRubric(
  rubric: string | object,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  options?: {
    throwOnError?: boolean;
    preferRemote?: boolean;
  },
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  // Use remote grading when no provider is explicitly configured, or when a
  // caller injected an implicit default provider but still prefers remote.
  const shouldPreferRemote =
    options?.preferRemote ||
    (grading as LlmRubricGradingConfig).__promptfooPreferRemote ||
    !grading.provider;
  if (
    !grading.rubricPrompt &&
    shouldPreferRemote &&
    !cliState.config?.redteam?.provider &&
    cliState.config?.redteam &&
    shouldGenerateRemote({ canUseCodexDefaultProvider: true })
  ) {
    try {
      return {
        ...(await doRemoteGrading({
          task: 'llm-rubric',
          rubric,
          output: llmOutput,
          vars: vars || {},
        })),
        assertion,
      };
    } catch (error) {
      return {
        ...fail(`Could not perform remote grading: ${error}`),
        assertion,
      };
    }
  }

  try {
    return await runJsonGradingPrompt({
      assertion,
      checkName: 'llm-rubric check',
      defaultPrompt: DEFAULT_GRADING_PROMPT,
      grading,
      label: 'llm-rubric',
      providerCallContext,
      throwOnError: options?.throwOnError,
      vars: {
        output: tryParse(llmOutput),
        rubric,
        ...(vars || {}),
      },
    });
  } catch (error) {
    if (options?.throwOnError) {
      throw new LlmRubricProviderError((error as Error).message || 'No output');
    }
    throw error;
  }
}

export async function matchesTrajectoryGoalSuccess(
  goal: string,
  trajectory: string,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  return runJsonGradingPrompt({
    assertion,
    checkName: 'trajectory:goal-success check',
    defaultPrompt: TRAJECTORY_GOAL_SUCCESS_PROMPT,
    grading,
    label: 'trajectory:goal-success',
    providerCallContext,
    vars: {
      ...(vars || {}),
      goal,
      output: tryParse(llmOutput),
      trajectory,
    },
  });
}

export async function matchesPiScore(
  renderedValue: string,
  llmInput: string,
  llmOutput: string,
  assertion?: Assertion,
): Promise<GradingResult> {
  return {
    ...(await doRemoteScoringWithPi(
      {
        llm_input: llmInput,
        llm_output: llmOutput,
        scoring_spec: [
          {
            question: renderedValue,
          },
        ],
      },
      assertion?.threshold,
    )),
    assertion,
  };
}

export async function matchesFactuality(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const parsedOutput = tryParse(output);
  const templateVars = { input, ideal: expected, completion: parsedOutput, ...(vars || {}) };

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, PROMPTFOO_FACTUALITY_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, templateVars);

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'factuality check',
  );

  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    'factuality',
    templateVars,
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'factuality produced malformed response');

  try {
    const parsedJson = parseFactualityJsonResponse(resp.output);
    if (parsedJson) {
      return buildFactualityResult(parsedJson.option, parsedJson.reason, grading, resp);
    }
  } catch (err) {
    return fail((err as Error).message, resp.tokenUsage);
  }

  // Fallback to old pattern matching format
  logger.info('Falling back to legacy pattern matching for factuality check');
  try {
    const parsedLegacy = parseLegacyFactualityResponse(resp.output);
    return buildFactualityResult(parsedLegacy.option, parsedLegacy.reason, grading, resp);
  } catch (err) {
    return fail((err as Error).message, resp.tokenUsage);
  }
}

export async function matchesClosedQa(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const parsedOutput = tryParse(output);
  const templateVars = { input, criteria: expected, completion: parsedOutput, ...(vars || {}) };

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_CLOSED_QA_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, templateVars);

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'model-graded-closedqa check',
  );
  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    'model-graded-closedqa',
    templateVars,
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'model-graded-closedqa produced malformed response');
  try {
    const pass = resp.output.trimEnd().endsWith('Y');
    let reason;
    if (pass) {
      reason = `The submission meets the criterion:\n${resp.output}`;
    } else if (resp.output.trimEnd().endsWith('N')) {
      reason = `The submission does not meet the criterion:\n${resp.output}`;
    } else {
      reason = `Model grader produced a malformed response:\n${resp.output}`;
    }
    return {
      pass,
      score: pass ? 1 : 0,
      reason,
      tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage),
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}

export async function matchesGEval(
  criteria: string,
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!input) {
    throw Error('No source text to estimate reply');
  }

  const maxScore = 10;
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'reply geval check',
  );

  const tokensUsed = normalizeMatcherTokenUsage(undefined);

  // Step 1: Get evaluation steps using renderLlmRubricPrompt
  const stepsRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['steps']
      : undefined;
  const stepsPrompt = await loadRubricPrompt(stepsRubricPrompt, GEVAL_PROMPT_STEPS);
  const promptSteps = await renderLlmRubricPrompt(stepsPrompt, { criteria });

  const respSteps = await callProviderWithContext(
    textProvider,
    promptSteps,
    'g-eval-steps',
    {
      criteria,
    },
    providerCallContext,
  );
  accumulateTokenUsage(tokensUsed, respSteps.tokenUsage);
  if (respSteps.error) {
    return fail(respSteps.error, tokensUsed);
  }
  if (!respSteps.output) {
    return fail('No output', tokensUsed);
  }
  if (typeof respSteps.output !== 'string') {
    return fail('LLM-proposed evaluation steps response is not a string', tokensUsed);
  }
  let steps;

  try {
    // NOTE: use regexp for reliable, because sometimes LLM wraps response to markdown format ```json...```
    const stepsMatch = respSteps.output.match(/\{"steps".+\}/g);
    if (!stepsMatch) {
      return fail(
        `LLM-proposed evaluation steps are not in JSON format: ${respSteps.output}`,
        tokensUsed,
      );
    }
    steps = JSON.parse(stepsMatch[0]).steps;

    if (!steps.length) {
      return fail('LLM does not propose any evaluation step', tokensUsed);
    }
  } catch (err) {
    return fail(
      `LLM-proposed evaluation steps are not in JSON format: ${(err as Error).message}\n\n${respSteps.output}`,
      tokensUsed,
    );
  }

  // Step 2: Use steps to evaluate using renderLlmRubricPrompt
  const evalRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['evaluate']
      : undefined;
  const evalPrompt = await loadRubricPrompt(evalRubricPrompt, GEVAL_PROMPT_EVALUATE);
  const evalVars = {
    criteria,
    steps: steps.join('\n- '),
    maxScore: maxScore.toString(),
    input: tryParse(input),
    output: tryParse(output),
  };
  const promptText = await renderLlmRubricPrompt(evalPrompt, evalVars);

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'g-eval',
    evalVars,
    providerCallContext,
  );
  accumulateTokenUsage(tokensUsed, resp.tokenUsage);
  if (resp.error) {
    return fail(resp.error, tokensUsed);
  }
  if (!resp.output) {
    return fail('No output', tokensUsed);
  }
  if (typeof resp.output !== 'string') {
    return fail('LLM-proposed evaluation result response is not a string', tokensUsed);
  }
  let result;

  try {
    const resultMatch = resp.output.match(/\{.+\}/g);
    if (!resultMatch) {
      return fail(
        `LLM-proposed evaluation result is not in JSON format: ${resp.output}`,
        tokensUsed,
      );
    }
    result = JSON.parse(resultMatch[0]);
  } catch (err) {
    return fail(
      `LLM-proposed evaluation result is not in JSON format: ${(err as Error).message}\n\n${resp.output}`,
      tokensUsed,
    );
  }

  const rawScore = typeof result.score === 'number' ? result.score : Number(result.score);
  if (!Number.isFinite(rawScore)) {
    return fail(
      `G-Eval result has invalid or missing score: ${JSON.stringify(result.score)}`,
      tokensUsed,
    );
  }

  return {
    pass: rawScore / maxScore >= threshold,
    score: rawScore / maxScore,
    reason: result.reason,
    tokensUsed,
  };
}
