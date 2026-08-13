import logger from '../../logger';
import { getNormalizedToolAttributes } from '../toolAttributes';
import {
  fetchWithProxy,
  MAX_TRACE_RESPONSE_BYTES,
  readLimitedResponse,
  releaseResponse,
  validateTraceProviderEndpoint,
} from './fetch';
import { TraceProviderError } from './types';

import type { SpanData } from '../store';
import type {
  FetchTraceOptions,
  FetchTraceResult,
  TraceProvider,
  TraceProviderConfig,
} from './types';

interface LangfuseObservation {
  id?: unknown;
  traceId?: unknown;
  parentObservationId?: unknown;
  name?: unknown;
  type?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  level?: unknown;
  statusMessage?: unknown;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  providedModelName?: unknown;
  modelParameters?: unknown;
  usageDetails?: unknown;
  inputUsage?: unknown;
  outputUsage?: unknown;
  totalUsage?: unknown;
  costDetails?: unknown;
  calculatedInputCost?: unknown;
  calculatedOutputCost?: unknown;
  calculatedTotalCost?: unknown;
  inputCost?: unknown;
  outputCost?: unknown;
  totalCost?: unknown;
}

interface LangfuseObservationsResponse {
  data?: unknown;
  meta?: { cursor?: unknown; page?: unknown; totalPages?: unknown };
}

const MAX_SPANS = 10_000;
const MAX_PAGE_SIZE = 1_000;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function observationAttributes(observation: LangfuseObservation): Record<string, unknown> {
  const rawMetadata =
    observation.metadata &&
    typeof observation.metadata === 'object' &&
    !Array.isArray(observation.metadata)
      ? (observation.metadata as Record<string, unknown>)
      : {};
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(
      ([key]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype',
    ),
  );
  const costDetails =
    observation.costDetails &&
    typeof observation.costDetails === 'object' &&
    !Array.isArray(observation.costDetails)
      ? (observation.costDetails as Record<string, unknown>)
      : {};
  const inputCost = costDetails.input ?? observation.calculatedInputCost ?? observation.inputCost;
  const outputCost =
    costDetails.output ?? observation.calculatedOutputCost ?? observation.outputCost;
  const totalCost = costDetails.total ?? observation.calculatedTotalCost ?? observation.totalCost;

  return {
    ...metadata,
    ...(typeof observation.type === 'string' && { 'langfuse.observation.type': observation.type }),
    ...(observation.input !== undefined && {
      'langfuse.input': parseJsonValue(observation.input),
    }),
    ...(observation.type === 'TOOL' &&
      typeof observation.name === 'string' &&
      observation.name.trim() &&
      getNormalizedToolAttributes(observation.name, parseJsonValue(observation.input))),
    ...(observation.output !== undefined && {
      'langfuse.output': parseJsonValue(observation.output),
    }),
    ...(typeof observation.providedModelName === 'string' && {
      'gen_ai.request.model': observation.providedModelName,
    }),
    ...(observation.modelParameters !== undefined &&
      observation.modelParameters !== null && {
        'langfuse.model.parameters': observation.modelParameters,
      }),
    ...(observation.usageDetails !== undefined &&
      observation.usageDetails !== null && {
        'langfuse.usage': observation.usageDetails,
      }),
    ...(typeof observation.inputUsage === 'number' && {
      'gen_ai.usage.input_tokens': observation.inputUsage,
    }),
    ...(typeof observation.outputUsage === 'number' && {
      'gen_ai.usage.output_tokens': observation.outputUsage,
    }),
    ...(typeof observation.totalUsage === 'number' && {
      'langfuse.usage.total_tokens': observation.totalUsage,
    }),
    ...(typeof inputCost === 'number' && {
      'langfuse.cost.input': inputCost,
    }),
    ...(typeof outputCost === 'number' && {
      'langfuse.cost.output': outputCost,
    }),
    ...(typeof totalCost === 'number' && {
      'langfuse.cost.total': totalCost,
    }),
  };
}

function transformObservation(
  observation: LangfuseObservation,
  traceId: string,
  options?: FetchTraceOptions,
): SpanData | null {
  if (
    typeof observation.id !== 'string' ||
    !observation.id ||
    typeof observation.traceId !== 'string' ||
    observation.traceId.toLowerCase() !== traceId ||
    typeof observation.startTime !== 'string'
  ) {
    return null;
  }

  const startTime = Date.parse(observation.startTime);
  if (
    Number.isNaN(startTime) ||
    (options?.earliestStartTime !== undefined && startTime < options.earliestStartTime)
  ) {
    return null;
  }

  const endTime = typeof observation.endTime === 'string' ? Date.parse(observation.endTime) : NaN;
  if (observation.endTime != null && (Number.isNaN(endTime) || endTime < startTime)) {
    return null;
  }
  if (
    observation.parentObservationId != null &&
    (typeof observation.parentObservationId !== 'string' ||
      !observation.parentObservationId ||
      observation.parentObservationId === observation.id)
  ) {
    return null;
  }

  return {
    spanId: observation.id,
    ...(typeof observation.parentObservationId === 'string' && {
      parentSpanId: observation.parentObservationId,
    }),
    name:
      typeof observation.name === 'string' && observation.name.trim()
        ? observation.name
        : 'langfuse.observation',
    startTime,
    ...(Number.isFinite(endTime) && { endTime }),
    attributes: observationAttributes(observation),
    statusCode: observation.level === 'ERROR' ? 2 : 1,
    ...(typeof observation.statusMessage === 'string' &&
      observation.statusMessage && {
        statusMessage: observation.statusMessage,
      }),
  };
}

function addObservations(
  observations: unknown[],
  spans: SpanData[],
  seenSpanIds: Set<string>,
  traceId: string,
  maxSpans: number,
  options?: FetchTraceOptions,
): void {
  for (const observation of observations) {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      logger.warn('[LangfuseProvider] Skipping malformed observation');
      continue;
    }

    const span = transformObservation(observation as LangfuseObservation, traceId, options);
    if (!span) {
      logger.warn('[LangfuseProvider] Skipping malformed or unrelated observation');
      continue;
    }
    if (!seenSpanIds.has(span.spanId)) {
      seenSpanIds.add(span.spanId);
      spans.push(span);
    }
    if (spans.length >= maxSpans) {
      return;
    }
  }
}

function getNextCursor(
  response: LangfuseObservationsResponse,
  seenCursors: Set<string>,
): string | undefined {
  const cursor = response.meta?.cursor;
  if (cursor == null) {
    return undefined;
  }
  if (typeof cursor !== 'string' || !cursor) {
    throw new TraceProviderError('Langfuse returned an invalid pagination cursor');
  }
  if (seenCursors.has(cursor)) {
    throw new TraceProviderError('Langfuse returned a repeated pagination cursor');
  }
  seenCursors.add(cursor);
  return cursor;
}

function getNextPage(response: LangfuseObservationsResponse): number | undefined {
  const { page, totalPages } = response.meta ?? {};
  if (page == null && totalPages == null) {
    return undefined;
  }
  if (
    page === 1 &&
    totalPages === 0 &&
    Array.isArray(response.data) &&
    response.data.length === 0
  ) {
    return undefined;
  }
  if (
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    typeof totalPages !== 'number' ||
    !Number.isSafeInteger(totalPages) ||
    totalPages < page
  ) {
    throw new TraceProviderError('Langfuse returned invalid pagination metadata');
  }

  return page < totalPages ? page + 1 : undefined;
}

/** Retrieve trace observations from Langfuse's public v2 Observations API. */
export class LangfuseProvider implements TraceProvider {
  readonly id = 'langfuse';
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(private readonly config: TraceProviderConfig) {
    if (!config.endpoint) {
      throw new Error('Langfuse provider requires endpoint configuration');
    }
    if (!config.auth?.username || !config.auth.password || config.auth.token) {
      throw new Error(
        'Langfuse provider requires public and secret keys as basic-auth credentials',
      );
    }

    validateTraceProviderEndpoint(config.endpoint, 'Langfuse');
    if (
      config.timeout !== undefined &&
      (!Number.isSafeInteger(config.timeout) || config.timeout <= 0)
    ) {
      throw new Error('Langfuse provider timeout must be a positive integer');
    }

    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.authorization = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers = Object.fromEntries(
      Object.entries(this.config.headers ?? {}).filter(
        ([name]) => !['accept', 'authorization'].includes(name.toLowerCase()),
      ),
    );
    return { ...headers, Accept: 'application/json', Authorization: this.authorization };
  }

  async fetchTrace(traceId: string, options?: FetchTraceOptions): Promise<FetchTraceResult | null> {
    if (!TRACE_ID_PATTERN.test(traceId) || /^0+$/.test(traceId)) {
      throw new TraceProviderError('Trace ID must contain 32 hexadecimal characters');
    }

    const normalizedTraceId = traceId.toLowerCase();
    const maxSpans = Math.min(Math.max(options?.maxSpans ?? MAX_SPANS, 1), MAX_SPANS);
    const pageSize = Math.min(maxSpans, MAX_PAGE_SIZE);
    const timeoutSignal = AbortSignal.timeout(this.config.timeout ?? 10_000);
    const signal = options?.abortSignal
      ? AbortSignal.any([timeoutSignal, options.abortSignal])
      : timeoutSignal;
    const spans: SpanData[] = [];
    const seenSpanIds = new Set<string>();
    const seenCursors = new Set<string>();
    let page: number | undefined;
    let cursor: string | undefined;
    let remainingBytes = MAX_TRACE_RESPONSE_BYTES;

    do {
      const url = new URL(`${this.baseUrl}/api/public/v2/observations`);
      url.searchParams.set('traceId', normalizedTraceId);
      url.searchParams.set('fields', 'core,basic,io,metadata,model,usage');
      url.searchParams.set('limit', String(pageSize));
      if (options?.earliestStartTime !== undefined) {
        url.searchParams.set('fromStartTime', new Date(options.earliestStartTime).toISOString());
      }
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      if (page) {
        url.searchParams.set('page', String(page));
      }

      const response = await fetchWithProxy(url.toString(), {
        disableTransientRetries: true,
        method: 'GET',
        headers: this.buildHeaders(),
        redirect: 'error',
        signal,
      });

      if (response.status === 404) {
        await releaseResponse(response, 'Langfuse');
        return null;
      }
      if (!response.ok) {
        await releaseResponse(response, 'Langfuse');
        throw new TraceProviderError(`Langfuse returned HTTP ${response.status}`, {
          statusCode: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        });
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > remainingBytes) {
        await releaseResponse(response, 'Langfuse');
        throw new TraceProviderError('Langfuse trace exceeds the maximum response size');
      }
      const body = await readLimitedResponse(response, 'Langfuse', remainingBytes);
      remainingBytes -= new TextEncoder().encode(body).byteLength;
      const result = JSON.parse(body) as LangfuseObservationsResponse;
      if (!Array.isArray(result.data)) {
        throw new TraceProviderError('Langfuse returned an invalid observations response');
      }

      addObservations(result.data, spans, seenSpanIds, normalizedTraceId, maxSpans, options);
      page = getNextPage(result);
      cursor = page ? undefined : getNextCursor(result, seenCursors);
    } while ((page || cursor) && spans.length < maxSpans);

    if (spans.length === 0) {
      return null;
    }

    const services = new Set<string>();
    for (const span of spans) {
      const service = span.attributes?.['service.name'];
      if (typeof service === 'string') {
        services.add(service);
      }
    }

    return { traceId: normalizedTraceId, spans, services: [...services], fetchedAt: Date.now() };
  }
}
