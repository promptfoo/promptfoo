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
import { callProviderWithContext, getAndCheckProvider } from './providers';
import {
  LlmRubricProviderError,
  loadRubricPrompt,
  renderLlmRubricPrompt,
  runJsonGradingPrompt,
} from './rubric';
import { accumulateTokens, fail, tryParse } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderResponse,
  TokenUsage,
  VarValue,
} from '../types/index';

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

function getProviderTokenUsage(resp: ProviderResponse): TokenUsage {
  return (
    resp.tokenUsage || {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    }
  );
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
    tokensUsed: getProviderTokenUsage(resp),
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
  },
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  // Use remote grading only if no provider is explicitly configured and remote generation is enabled
  if (
    !grading.rubricPrompt &&
    !cliState.config?.redteam?.provider &&
    cliState.config?.redteam &&
    shouldGenerateRemote({ canUseCodexDefaultProvider: true })
  ) {
    return {
      ...(await doRemoteGrading({
        task: 'llm-rubric',
        rubric,
        output: llmOutput,
        vars: vars || {},
      })),
      assertion,
    };
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

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, PROMPTFOO_FACTUALITY_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    ideal: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

  // Get the appropriate provider
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
    {
      input,
      ideal: expected,
      completion: tryParse(output),
      ...(vars || {}),
    },
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

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_CLOSED_QA_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    criteria: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

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
    {
      input,
      criteria: expected,
      completion: tryParse(output),
      ...(vars || {}),
    },
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
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
        numRequests: resp.tokenUsage?.numRequests || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
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

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

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
  accumulateTokens(tokensUsed, respSteps.tokenUsage);
  let steps;

  try {
    // NOTE: use regexp for reliable, because sometimes LLM wraps response to markdown format ```json...```
    steps = JSON.parse(respSteps.output.match(/\{"steps".+\}/g)[0]).steps;

    if (!steps.length) {
      return fail('LLM does not propose any evaluation step', tokensUsed);
    }
  } catch {
    return fail(
      `LLM-proposed evaluation steps are not in JSON format: ${respSteps.output}`,
      tokensUsed,
    );
  }

  // Step 2: Use steps to evaluate using renderLlmRubricPrompt
  const evalRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['evaluate']
      : undefined;
  const evalPrompt = await loadRubricPrompt(evalRubricPrompt, GEVAL_PROMPT_EVALUATE);
  const promptText = await renderLlmRubricPrompt(evalPrompt, {
    criteria,
    steps: steps.join('\n- '),
    maxScore: maxScore.toString(),
    input: tryParse(input),
    output: tryParse(output),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'g-eval',
    {
      criteria,
      steps: steps.join('\n- '),
      maxScore: maxScore.toString(),
      input: tryParse(input),
      output: tryParse(output),
    },
    providerCallContext,
  );
  accumulateTokens(tokensUsed, resp.tokenUsage);
  let result;

  try {
    result = JSON.parse(resp.output.match(/\{.+\}/g)[0]);
  } catch {
    return fail(`LLM-proposed evaluation result is not in JSON format: ${resp.output}`, tokensUsed);
  }

  return {
    pass: result.score / maxScore >= threshold,
    score: result.score / maxScore,
    reason: result.reason,
    tokensUsed,
  };
}
