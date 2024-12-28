import dedent from 'dedent';
import logger from '../../../logger';
import { type ApiProvider } from '../../../types';
import { extractFirstJsonObject } from '../../../util/json';
import type { JudgeScoreResult, OnTopicResult } from './types';

export async function getRedteamResponse(redteamProvider: ApiProvider, redteamHistory: any[]) {
  const redteamBody = JSON.stringify(redteamHistory);
  const redteamResp = await redteamProvider.callApi(redteamBody, {
    prompt: {
      raw: redteamBody,
      label: 'history',
    },
    vars: {},
  });

  if (redteamResp.error) {
    throw new Error(`Error from redteam provider: ${redteamResp.error}`);
  }

  logger.debug(`[Iterative] Redteam response: ${JSON.stringify(redteamResp)}`);
  return redteamResp;
}

export async function checkIfOnTopic(
  redteamProvider: ApiProvider,
  onTopicSystemPrompt: string,
  targetPrompt: string,
): Promise<OnTopicResult> {
  const isOnTopicBody = JSON.stringify([
    {
      role: 'system',
      content: onTopicSystemPrompt,
    },
    {
      role: 'user',
      content: targetPrompt,
    },
  ]);

  const isOnTopicResp = await redteamProvider.callApi(isOnTopicBody, {
    prompt: {
      raw: isOnTopicBody,
      label: 'on-topic',
    },
    vars: {},
  });

  if (isOnTopicResp.error) {
    throw new Error(`Error from redteam (onTopic) provider: ${isOnTopicResp.error}`);
  }

  logger.debug(`[Iterative] On-topic response: ${JSON.stringify(isOnTopicResp)}`);

  try {
    return {
      isOnTopic: (extractFirstJsonObject(isOnTopicResp.output) as { onTopic: boolean }).onTopic,
      tokenUsage: isOnTopicResp.tokenUsage,
    };
  } catch (err) {
    logger.debug(
      `[Iterative] Failed to parse onTopic response, likely refusal: ${err} ${JSON.stringify(isOnTopicResp)}`,
    );
    return { isOnTopic: false, tokenUsage: undefined };
  }
}

export async function getJudgeScore(
  redteamProvider: ApiProvider,
  judgeSystemPrompt: string,
  currentResponse: string,
  bestResponse: string | undefined,
): Promise<JudgeScoreResult> {
  const judgeBody = JSON.stringify([
    {
      role: 'system',
      content: judgeSystemPrompt,
    },
    {
      role: 'user',
      content: dedent`
        Current Response:
        ${currentResponse}

        Previous Best Response:
        ${bestResponse || 'None'}
      `,
    },
  ]);

  const judgeResp = await redteamProvider.callApi(judgeBody, {
    prompt: {
      raw: judgeBody,
      label: 'judge',
    },
    vars: {},
  });

  if (judgeResp.error) {
    throw new Error(`Error from redteam (judge) provider: ${judgeResp.error}`);
  }

  try {
    const parsed = extractFirstJsonObject<{
      currentResponse: { rating: number; explanation: string };
      previousBestResponse: { rating: number; explanation: string };
    }>(judgeResp.output);

    return {
      currentScore: parsed.currentResponse.rating,
      previousScore: parsed.previousBestResponse?.rating || 0,
      explanation: parsed.currentResponse.explanation,
      tokenUsage: judgeResp.tokenUsage,
    };
  } catch (err) {
    logger.debug(
      `[Iterative] Failed to parse judge response, likely refusal: ${err} ${JSON.stringify(judgeResp)}`,
    );
    return { currentScore: 1, previousScore: 0, explanation: '', tokenUsage: undefined };
  }
}
