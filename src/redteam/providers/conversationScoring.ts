import logger from '../../logger';
import invariant from '../../util/invariant';
import { extractFirstJsonObject } from '../../util/json';
import { sleep } from '../../util/time';
import { TokenUsageTracker } from '../../util/tokenUsage';
import { accumulateGradingResponseTokenUsage } from '../../util/tokenUsageUtils';
import { isBasicRefusal } from '../util';
import { EVAL_SYSTEM_PROMPT, REFUSAL_SYSTEM_PROMPT } from './crescendo/prompts';
import { callGradingProvider } from './shared';
import type { Environment } from 'nunjucks';

import type { ApiProvider, CallApiOptionsParams, TokenUsage } from '../../types';

interface ScoringContext {
  logPrefix: string;
  userGoal: string | undefined;
  nunjucks: Pick<Environment, 'renderString'>;
  getScoringProvider: () => Promise<ApiProvider>;
}

export async function getRefusalScore(
  context: ScoringContext,
  attackPrompt: string,
  lastResponse: string,
  tokenUsage: TokenUsage,
  options?: CallApiOptionsParams,
): Promise<[boolean, string]> {
  logger.debug(`[${context.logPrefix}] Getting refusal score for prompt: ${attackPrompt}`);
  if (isBasicRefusal(lastResponse)) {
    logger.debug(
      `[${context.logPrefix}] Response contains a standard refusal prefix. Short-circuiting refusal grading.`,
    );
    return [true, 'The output contains a standard refusal.'];
  }

  const refusalInput = JSON.stringify({
    conversationObjective: attackPrompt,
    responseToEvaluateInput: lastResponse,
  });

  const refusalSystemPrompt = context.nunjucks.renderString(REFUSAL_SYSTEM_PROMPT, {
    conversationObjective: context.userGoal,
  });

  const refusalBody = JSON.stringify([
    { role: 'system', content: refusalSystemPrompt },
    { role: 'user', content: refusalInput },
  ]);

  const scoringProvider = await context.getScoringProvider();
  const refusalResponse = await callGradingProvider(
    scoringProvider,
    refusalBody,
    {
      prompt: {
        raw: refusalBody,
        label: 'refusal',
      },
      vars: {},
    },
    options,
  );
  TokenUsageTracker.getInstance().trackResponseUsage(scoringProvider.id(), refusalResponse);
  accumulateGradingResponseTokenUsage(tokenUsage, refusalResponse);
  if (scoringProvider.delay) {
    logger.debug(`[${context.logPrefix}] Sleeping for ${scoringProvider.delay}ms`);
    await sleep(scoringProvider.delay);
  }
  if (refusalResponse.error) {
    throw new Error(`Error from redteam (refusal) provider: ${refusalResponse.error}`);
  }

  logger.debug(`[${context.logPrefix}] Refusal score response: ${refusalResponse.output}`);

  const parsed =
    typeof refusalResponse.output === 'string'
      ? extractFirstJsonObject<{
          value: boolean;
          metadata: number;
          rationale: string;
        }>(refusalResponse.output)
      : refusalResponse.output;

  logger.debug(`[${context.logPrefix}] Refusal score parsed response`, { parsed });
  invariant(typeof parsed.value === 'boolean', 'Expected refusal grader value to be a boolean');
  invariant(typeof parsed.metadata === 'number', 'Expected refusal grader metadata to be a number');

  return [parsed.value, parsed.rationale];
}

export async function getEvalScore(
  context: ScoringContext,
  lastResponse: string,
  tokenUsage: TokenUsage,
  options?: CallApiOptionsParams,
): Promise<any> {
  logger.debug(
    `[${context.logPrefix}] Getting eval score for response: ${lastResponse.substring(0, 100)}...`,
  );
  const evalInput = JSON.stringify({
    conversationObjective: context.userGoal,
    responseToEvaluateInput: lastResponse,
  });

  const evalSystemPrompt = context.nunjucks.renderString(EVAL_SYSTEM_PROMPT, {
    conversationObjective: context.userGoal,
  });

  const evalBody = JSON.stringify([
    { role: 'system', content: evalSystemPrompt },
    { role: 'user', content: evalInput },
  ]);

  const scoringProvider = await context.getScoringProvider();
  const evalResponse = await callGradingProvider(
    scoringProvider,
    evalBody,
    {
      prompt: {
        raw: evalBody,
        label: 'eval',
      },
      vars: {},
    },
    options,
  );
  TokenUsageTracker.getInstance().trackResponseUsage(scoringProvider.id(), evalResponse);
  accumulateGradingResponseTokenUsage(tokenUsage, evalResponse);
  if (scoringProvider.delay) {
    logger.debug(`[${context.logPrefix}] Sleeping for ${scoringProvider.delay}ms`);
    await sleep(scoringProvider.delay);
  }
  if (evalResponse.error) {
    throw new Error(`Error from redteam (eval) provider: ${evalResponse.error}`);
  }

  logger.debug(`[${context.logPrefix}] Eval score response: ${evalResponse.output}`);

  const parsed =
    typeof evalResponse.output === 'string'
      ? extractFirstJsonObject<{
          value: boolean;
          description: string;
          rationale: string;
          metadata: number;
        }>(evalResponse.output)
      : evalResponse.output;

  logger.debug(`[${context.logPrefix}] Eval score parsed response`, { parsed });
  invariant(
    typeof parsed.value === 'boolean',
    `Expected eval grader value to be a boolean: ${parsed}`,
  );
  invariant(
    typeof parsed.metadata === 'number',
    `Expected eval grader metadata to be a number: ${parsed}`,
  );

  return parsed;
}
