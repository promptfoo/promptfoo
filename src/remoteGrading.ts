import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { remoteGenerationFetchWithCache } from './redteam/remoteGeneration';
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

    const { data } = await remoteGenerationFetchWithCache({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

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
