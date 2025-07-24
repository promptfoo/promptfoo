import { fetchWithCache } from './cache';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { getRemoteGenerationUrl } from './redteam/remoteGeneration';

import type { GradingResult } from './types';

type RemoteGradingPayload = {
  task: string;
  [key: string]: unknown;
};

export async function doRemoteGrading(
  payload: RemoteGradingPayload,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    payload.email = getUserEmail();
    const body = JSON.stringify(payload);
    logger.debug(`Performing remote grading: ${body}`);
    const { data, status, statusText } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      },
      REQUEST_TIMEOUT_MS,
    );

    logger.debug(
      `Remote grading result: status=${status}, statusText=${statusText}, data=${JSON.stringify(data)}`,
    );

    if (status !== 200) {
      throw new Error(
        `Remote grading failed with status ${status}: ${statusText} ${JSON.stringify(data)}`,
      );
    }
    const { result } = data as { result: GradingResult };

    if (!result || result.pass === undefined) {
      throw new Error(`Remote grading failed. Response data is invalid: ${JSON.stringify(data)}`);
    }

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
