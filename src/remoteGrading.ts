import { LRUCache } from 'lru-cache';
import { fetchWithCache } from './cache';
import { hasMatchingTaxonomy } from './contracts/gradingTaxonomy';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './redteam/remoteGeneration';
import { getActiveTraceparent } from './tracing/spanRoles';
import { fetchWithProxy } from './util/fetch/index';

import type { GradingResult, StructuredGradingRubric } from './types/index';

type RemoteGradingPayload = Partial<StructuredGradingRubric> & {
  task: string;
  [key: string]: unknown;
};

// Share in-flight discovery across assertions, including when grading the first batch concurrently.
const structuredRubricSupport = new LRUCache<string, boolean>({
  max: 32,
  ttl: 5 * 60_000,
  fetchMethod: checkStructuredRubricSupport,
});

async function checkStructuredRubricSupport(taskUrl: string): Promise<boolean> {
  try {
    const url = new URL(taskUrl);
    url.pathname = url.pathname.replace(/\/?$/, '/version');
    const response = await fetchWithProxy(url.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      disableTransientRetries: true,
    });
    if (!response.ok) {
      return false;
    }
    const info = await response.json();
    return Array.isArray(info?.capabilities) && info.capabilities.includes('structured-rubric');
  } catch {
    return false;
  }
}

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
    const url = getRemoteGenerationUrl();
    const { policy, taxonomy, ...legacyPayload } = payload;
    const request = { ...legacyPayload, email: getUserEmail() };
    const supported = policy && taxonomy && (await structuredRubricSupport.fetch(url));
    const wirePayload = supported ? { ...request, policy, taxonomy } : request;
    const body = JSON.stringify(wirePayload);
    const traceparent = getActiveTraceparent();
    logger.debug('Performing remote grading', { body: redactImagePayloads(wirePayload) });
    const { cached, data, status, statusText } = await fetchWithCache(
      url,
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
      supported &&
      taxonomy &&
      typeof payload.output === 'string' &&
      hasMatchingTaxonomy(result, taxonomy, payload.output);
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
