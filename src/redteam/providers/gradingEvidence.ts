import logger from '../../logger';
import {
  extractTraceIdFromTraceparent,
  fetchTraceContext,
  type TraceContextData,
} from '../../tracing/traceContext';
import { mergeExfilEvidence } from '../grading/storedResult';
import { checkExfilTracking } from '../strategies/indirectWebPwn';
import { formatTraceSummary } from './traceFormatting';

import type { RedteamGradingContext } from '../grading/types';
import type { RedteamTracingOptions } from './tracingOptions';

export type { TraceContextData };

type ProviderResponse = NonNullable<RedteamGradingContext['providerResponse']>;

/** Collect only the target attempt's spans, using the configured bounded wait and retries. */
export async function collectTargetTrace({
  tracing,
  traceparent,
  startedAt,
  response,
  signal,
  snapshots,
}: {
  tracing?: RedteamTracingOptions;
  traceparent?: string | null;
  startedAt: number;
  response: Pick<ProviderResponse, 'cached' | 'error'>;
  signal?: AbortSignal;
  snapshots?: TraceContextData[];
}): Promise<{ traceContext: TraceContextData | null; traceSummary?: string }> {
  if (
    !tracing?.enabled ||
    !(tracing.includeInAttack || tracing.includeInGrading) ||
    response.cached ||
    (response.error && signal?.aborted)
  ) {
    return { traceContext: null };
  }
  const traceId = traceparent ? extractTraceIdFromTraceparent(traceparent) : null;
  if (!traceId) {
    return { traceContext: null };
  }
  const traceContext = await fetchTraceContext(traceId, {
    abortSignal: signal,
    earliestStartTime: startedAt,
    includeInternalSpans: tracing.includeInternalSpans,
    maxSpans: tracing.maxSpans,
    maxDepth: tracing.maxDepth,
    maxRetries: tracing.maxRetries,
    retryDelayMs: tracing.retryDelayMs,
    spanFilter: tracing.spanFilter,
    sanitizeAttributes: tracing.sanitizeAttributes,
    providerConfig: tracing.provider,
    queryDelay: tracing.queryDelay,
    redactAttributes: tracing.redactAttributes,
  });
  if (!traceContext) {
    return { traceContext: null };
  }
  snapshots?.push(traceContext);
  return { traceContext, traceSummary: formatTraceSummary(traceContext) };
}

/** Prepare the same target evidence for every plugin grader, including layered attacks. */
export async function prepareGradingEvidence({
  response,
  tracing,
  traceContext,
  traceSummary,
  trackingMetadata,
  fallbackTrackingMetadata,
  evaluationId,
}: {
  response: ProviderResponse;
  tracing?: RedteamTracingOptions;
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  trackingMetadata?: Record<string, unknown>;
  fallbackTrackingMetadata?: Record<string, unknown>;
  evaluationId?: string;
}): Promise<RedteamGradingContext> {
  let context: RedteamGradingContext = {
    providerResponse: response,
    ...(response.images?.length && { imageOutputs: response.images }),
    ...(tracing?.includeInGrading && { traceContext, traceSummary }),
  };
  const metadata = response.metadata;
  if (typeof metadata?.wasExfiltrated === 'boolean') {
    context = mergeExfilEvidence(context, {
      wasExfiltrated: metadata.wasExfiltrated,
      exfilCount: Number(metadata.exfilCount) || 0,
      exfilRecords: [],
    });
  }
  const source =
    typeof trackingMetadata?.webPageUuid === 'string' ? trackingMetadata : fallbackTrackingMetadata;
  const uuid = typeof source?.webPageUuid === 'string' ? source.webPageUuid : undefined;
  if (uuid) {
    const url = source?.webPageUrl;
    const evalId =
      evaluationId ??
      (typeof url === 'string' ? url.match(/\/dynamic-pages\/([^/]+)\//)?.[1] : undefined);
    context.webPageTrackingIds = { uuid, evalId };
    if (context.wasExfiltrated !== true) {
      try {
        const tracking = await checkExfilTracking(uuid, evalId);
        if (tracking) {
          context = mergeExfilEvidence(context, tracking);
        }
      } catch (error) {
        logger.warn('[Redteam] Failed to fetch exfil tracking', { error, uuid });
      }
    }
  }
  return context;
}
