import { fetchWithCache } from './cache';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { hasMatchingTaxonomy } from './matchers/taxonomy';
import { getRequestTimeoutMs } from './providers/shared';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './redteam/remoteGeneration';
import { getActiveTraceparent } from './tracing/spanRoles';

import type { GradingResult, GradingTaxonomy } from './types/index';

type RemoteGradingPayload = {
  task: string;
  config?: { taxonomy?: GradingTaxonomy };
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
    const traceparent = getActiveTraceparent();
    logger.debug('Performing remote grading', { body: redactImagePayloads(payload) });
    const { cached, data, status, statusText } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders(traceparent ? { traceparent } : undefined),
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

    const metadata = { ...result.metadata };
    const verifiedFindings =
      payload.config?.taxonomy &&
      typeof payload.output === 'string' &&
      hasMatchingTaxonomy(result, payload.config.taxonomy, payload.output);
    if (!verifiedFindings) {
      delete metadata.taxonomy;
    }
    return {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      ...(verifiedFindings && { findings: result.findings }),
      tokensUsed: cached
        ? {
            total: 0,
            cached:
              result.tokensUsed?.total ??
              (result.tokensUsed?.prompt ?? 0) + (result.tokensUsed?.completion ?? 0),
            numRequests: 0,
          }
        : result.tokensUsed
          ? {
              ...result.tokensUsed,
              // This endpoint represents one grading task even when the task uses multiple models.
              numRequests: 1,
            }
          : undefined,
      metadata: cached ? { ...metadata, cachedResponse: true } : result.metadata && metadata,
    };
  } catch (error) {
    throw new Error(`Could not perform remote grading: ${error}`);
  }
}
