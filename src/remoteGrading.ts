import { fetchWithCache } from './cache';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getRemoteGenerationUrl } from './redteam/remoteGeneration';

import type { GradingResult } from './types/index';

type RemoteGradingPayload = {
  task: string;
  [key: string]: unknown;
};

function getRemoteGradingResponseMetadata(data: unknown) {
  const result = (data as { result?: unknown } | null | undefined)?.result;
  return {
    hasResult: Boolean(result),
    resultType: typeof result,
  };
}

function isRemoteGradingResponse(data: unknown): data is { result?: unknown } {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

function isGradingResult(result: unknown): result is Omit<GradingResult, 'assertion'> {
  return (
    typeof result === 'object' &&
    result !== null &&
    !Array.isArray(result) &&
    typeof (result as { pass?: unknown }).pass === 'boolean'
  );
}

function formatRemoteGradingError(error: unknown): string {
  if (
    error instanceof Error &&
    (/^Remote grading failed with status \d+$/.test(error.message) ||
      error.message === 'Remote grading failed. Response data is invalid')
  ) {
    return error.message;
  }

  return 'Remote grading request failed';
}

export async function doRemoteGrading(
  payload: RemoteGradingPayload,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    payload.email = getUserEmail();
    const body = JSON.stringify(payload);
    logger.debug('Performing remote grading', { task: payload.task });
    const { data, status } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promptfoo-silent': 'true',
        },
        body,
      },
      getRequestTimeoutMs(),
      'json',
      true,
    );

    logger.debug('Remote grading result', {
      status,
      ...getRemoteGradingResponseMetadata(data),
    });

    if (status !== 200) {
      throw new Error(`Remote grading failed with status ${status}`);
    }
    if (!isRemoteGradingResponse(data)) {
      throw new Error('Remote grading failed. Response data is invalid');
    }

    const { result } = data;

    if (!isGradingResult(result)) {
      throw new Error('Remote grading failed. Response data is invalid');
    }

    return {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      tokensUsed: result.tokensUsed,
    };
  } catch (error) {
    throw new Error(formatRemoteGradingError(error));
  }
}
