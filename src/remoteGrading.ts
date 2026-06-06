import { fetchWithCache } from './cache';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './redteam/remoteGeneration';

import type { GradingResult } from './types/index';

type RemoteGradingPayload = {
  task: string;
  [key: string]: unknown;
};

function redactImagePayloads(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactImagePayloads(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === 'images' && Array.isArray(item)) {
        return [
          key,
          item.map((image) => {
            if (!image || typeof image !== 'object' || Array.isArray(image)) {
              return redactImagePayloads(image);
            }

            return Object.fromEntries(
              Object.entries(image).map(([imageKey, imageValue]) => [
                imageKey,
                imageKey === 'data' ? '[REDACTED_IMAGE_DATA]' : redactImagePayloads(imageValue),
              ]),
            );
          }),
        ];
      }

      return [key, redactImagePayloads(item)];
    }),
  );
}

export async function doRemoteGrading(
  payload: RemoteGradingPayload,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    payload.email = getUserEmail();
    const body = JSON.stringify(payload);
    logger.debug('Performing remote grading', { body: redactImagePayloads(payload) });
    const { data, status, statusText } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders(),
        body,
      },
      getRequestTimeoutMs(),
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
      metadata: result.metadata,
    };
  } catch (error) {
    throw new Error(`Could not perform remote grading: ${error}`);
  }
}
