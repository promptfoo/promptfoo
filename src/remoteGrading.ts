import { fetchWithCache } from './cache';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { REMOTE_GENERATION_URL } from './redteam/constants';
import type { GradingResult } from './types';

type RemoteGradingPayload = {
  task: string;
  [key: string]: unknown;
};

export async function doRemoteGrading(
  payload: RemoteGradingPayload,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    const body = JSON.stringify(payload);
    logger.debug(`Performing remote grading: ${body}`);
    const { data } = await fetchWithCache(
      REMOTE_GENERATION_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      },
      REQUEST_TIMEOUT_MS,
    );

    const { result } = data as { result: GradingResult };
    logger.debug(`Got remote grading result: ${JSON.stringify(result)}`);
    return {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      tokensUsed: result.tokensUsed,
    };
  } catch (error) {
    throw new Error(`Could not perform remote grading: ${error}`);
  }
}
