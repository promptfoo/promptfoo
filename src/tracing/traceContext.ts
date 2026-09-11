import logger from '../logger';
import { createTraceProvider, isExternalTraceProvider } from './providers';
import {
  type FetchTraceOptions,
  type TraceProviderConfig,
  TraceProviderError,
} from './providers/types';
import { sanitizeTraceAttributes } from './sanitizeAttributes';
import { getTraceStore, type SpanData, type TraceSpanQueryOptions } from './store';
import { getToolNameFromAttributes } from './toolAttributes';

export interface TraceEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, any>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, any>;
  status: {
    code: 'unset' | 'ok' | 'error';
    message?: string;
  };
  depth: number;
  events: TraceEvent[];
}

export interface TraceContextData {
  traceId: string;
  spans: TraceSpan[];
  insights: string[];
  fetchedAt: number;
}

export interface FetchTraceContextOptions
  extends Omit<TraceSpanQueryOptions, 'includeInternalSpans' | 'sanitizeAttributes'> {
  includeInternalSpans?: boolean;
  sanitizeAttributes?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  /** External trace provider configuration (Tempo, Jaeger, etc.) */
  providerConfig?: TraceProviderConfig;
  /** Delay in ms before querying external provider (allows spans to arrive). Default: 3000 */
  queryDelay?: number;
  /** Additional evaluation-specific attribute names to redact before persistence. */
  redactAttributes?: string[];
  /** Abort signal for the evaluation that requested these spans. */
  abortSignal?: AbortSignal;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_QUERY_DELAY_MS = 3000;
const EXTERNAL_SPAN_BATCH_SIZE = 500;
const inFlightExternalFetches = new WeakMap<
  TraceProviderConfig,
  Map<string, Promise<TraceContextData | null>>
>();

const SPAN_KIND_MAP: Record<number, string> = {
  0: 'unspecified',
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
};

function resolveSpanKind(span: SpanData): string {
  const attributes = span.attributes || {};
  const attributeKind = (attributes['span.kind'] ||
    attributes['otel.span.kind'] ||
    attributes['spanKind'] ||
    attributes['kind']) as string | undefined;

  if (attributeKind) {
    return `${attributeKind}`.toLowerCase();
  }

  const numericKind = attributes['otel.span.kind_code'];
  if (typeof numericKind === 'number' && numericKind in SPAN_KIND_MAP) {
    return SPAN_KIND_MAP[numericKind];
  }

  return 'unspecified';
}

function mapStatusCode(span: SpanData): 'unset' | 'ok' | 'error' {
  switch (span.statusCode) {
    case 1:
      return 'ok';
    case 2:
      return 'error';
    default:
      return 'unset';
  }
}

function buildSpanTree(spans: SpanData[]): Map<string, number> {
  const depthMap = new Map<string, number>();
  const spansById = new Map(spans.map((span) => [span.spanId, span]));
  const depthCache = new Map<string, number | null>();
  for (const span of spans) {
    const depth = computeSpanDepth(span, spansById, depthCache);
    if (depth !== null) {
      depthMap.set(span.spanId, depth);
    }
  }

  return depthMap;
}

function createTraceSpans(spans: SpanData[]): TraceSpan[] {
  const depthMap = buildSpanTree(spans);

  return spans.map((span) => {
    const endTime = span.endTime ?? span.startTime;
    const durationMs = Math.max(0, endTime - span.startTime);

    return {
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: resolveSpanKind(span),
      startTime: span.startTime,
      endTime: span.endTime,
      durationMs,
      attributes: span.attributes || {},
      status: {
        code: mapStatusCode(span),
        message: span.statusMessage,
      },
      depth: depthMap.get(span.spanId) ?? 0,
      events: [],
    };
  });
}

function deriveInsights(traceSpans: TraceSpan[]): string[] {
  if (traceSpans.length === 0) {
    return [];
  }

  const insights: string[] = [];

  const errorSpans = traceSpans.filter((span) => span.status.code === 'error');
  errorSpans.forEach((span) => {
    const statusMessage = span.status.message ? `: ${span.status.message}` : '';
    insights.push(`Error span "${span.name}" (${span.spanId.slice(0, 8)})${statusMessage}`);
  });

  const toolCalls = traceSpans
    .map((span) => ({ span, toolName: getToolNameFromAttributes(span.attributes) }))
    .filter((entry) => entry.toolName);
  toolCalls.forEach(({ span, toolName }) => {
    insights.push(`Tool call ${toolName} via "${span.name}" (duration ${span.durationMs ?? 0}ms)`);
  });

  const guardrailHits = traceSpans.filter(
    (span) => span.attributes['guardrail.name'] || span.attributes['guardrails.decision'],
  );
  guardrailHits.forEach((span) => {
    const decision =
      span.attributes['guardrails.decision'] ?? span.attributes['guardrail.decision'];
    insights.push(
      `Guardrail ${span.attributes['guardrail.name'] ?? span.name} decision: ${decision ?? 'unknown'}`,
    );
  });

  return insights.slice(0, 20);
}

export function extractTraceIdFromTraceparent(traceparent: string): string | null {
  if (!traceparent) {
    return null;
  }

  const parts = traceparent.split('-');
  const [version, traceId, parentSpanId, flags] = parts;
  const validPartCount = version?.toLowerCase() === '00' ? parts.length === 4 : parts.length >= 4;
  if (
    !/^[0-9a-f]{2}$/i.test(version) ||
    version.toLowerCase() === 'ff' ||
    !validPartCount ||
    !/^[0-9a-f]{32}$/i.test(traceId) ||
    /^0+$/.test(traceId) ||
    !/^[0-9a-f]{16}$/i.test(parentSpanId) ||
    /^0+$/.test(parentSpanId) ||
    !/^[0-9a-f]{2}$/i.test(flags)
  ) {
    return null;
  }
  return traceId.toLowerCase();
}

/**
 * Compute the depth of a span in the span tree, rejecting cyclic parent chains.
 */
function computeSpanDepth(
  span: SpanData,
  spanMap: Map<string, SpanData>,
  depthCache: Map<string, number | null>,
): number | null {
  const ancestors: SpanData[] = [];
  const visited = new Set<string>();
  let current: SpanData | undefined = span;
  let depth = -1;

  while (current) {
    const cachedDepth = depthCache.get(current.spanId);
    if (cachedDepth !== undefined) {
      if (cachedDepth === null) {
        for (const ancestor of ancestors) {
          depthCache.set(ancestor.spanId, null);
        }
        return null;
      }
      depth = cachedDepth;
      break;
    }

    if (visited.has(current.spanId)) {
      for (const ancestor of ancestors) {
        depthCache.set(ancestor.spanId, null);
      }
      return null;
    }

    visited.add(current.spanId);
    ancestors.push(current);
    current = current.parentSpanId ? spanMap.get(current.parentSpanId) : undefined;
  }

  for (let index = ancestors.length - 1; index >= 0; index--) {
    depth += 1;
    depthCache.set(ancestors[index].spanId, depth);
  }

  return depth;
}

/**
 * Drop malformed parent cycles before persisting or processing external spans.
 */
function discardCyclicExternalSpans(spans: SpanData[]): SpanData[] {
  const spanMap = new Map(spans.map((span) => [span.spanId, span]));
  const depthCache = new Map<string, number | null>();
  const cyclicSpanIds = new Set<string>();

  const validSpans = spans.filter((span) => {
    const depth = computeSpanDepth(span, spanMap, depthCache);
    if (depth === null) {
      cyclicSpanIds.add(span.spanId);
      return false;
    }

    return true;
  });

  if (cyclicSpanIds.size > 0) {
    logger.warn(
      `[TraceContext] Skipping ${cyclicSpanIds.size} spans with cyclic parent relationships`,
    );
  }

  return validSpans;
}

/**
 * Store spans fetched from an external provider in the local database.
 * This allows the spans to be displayed in the UI and persisted.
 */
async function storeExternalSpans(traceId: string, spans: SpanData[]): Promise<boolean> {
  try {
    const traceStore = getTraceStore();
    for (let index = 0; index < spans.length; index += EXTERNAL_SPAN_BATCH_SIZE) {
      const result = await traceStore.addSpans(
        traceId,
        spans.slice(index, index + EXTERNAL_SPAN_BATCH_SIZE),
        {
          warnIfMissingTrace: false,
          ...(index > 0 && { skipTraceCheck: true }),
        },
      );
      if (!result.stored) {
        return false;
      }
    }
    logger.debug(`[TraceContext] Stored ${spans.length} spans from external provider`);
    return true;
  } catch (error) {
    logger.warn(`[TraceContext] Failed to store external spans: ${error}`);
    return false;
  }
}

function redactExternalSpan(span: SpanData, redactAttributes: string[]): SpanData {
  const attributes = span.attributes ?? {};
  const sanitizedAttributes = sanitizeTraceAttributes(attributes, {
    redactAttributes,
    sanitizeSensitiveAttributes: false,
    truncateValues: false,
  });
  const redactedValues = new Set<string>();
  const pendingValues: Array<{ original: unknown; sanitized: unknown }> = [
    { original: attributes, sanitized: sanitizedAttributes },
  ];
  while (pendingValues.length > 0) {
    const { original, sanitized } = pendingValues.pop()!;
    if (typeof original !== 'object') {
      if (original !== undefined && sanitized === '[REDACTED]') {
        const value = String(original);
        if (value.length > 0) {
          redactedValues.add(value);
        }
      }
      continue;
    }
    if (!original) {
      continue;
    }
    if (Array.isArray(original)) {
      for (let index = 0; index < original.length; index++) {
        pendingValues.push({
          original: original[index],
          sanitized: sanitized === '[REDACTED]' ? sanitized : (sanitized as unknown[])?.[index],
        });
      }
      continue;
    }
    for (const [key, value] of Object.entries(original)) {
      pendingValues.push({
        original: value,
        sanitized:
          sanitized === '[REDACTED]' ? sanitized : (sanitized as Record<string, unknown>)?.[key],
      });
    }
  }
  const orderedRedactedValues = [...redactedValues].sort(
    (left, right) => right.length - left.length,
  );
  const scrubEcho = <T extends string | undefined>(value: T): T => {
    if (typeof value !== 'string') {
      return value;
    }

    let sanitizedValue: string = value;
    for (const redactedValue of orderedRedactedValues) {
      sanitizedValue = sanitizedValue.split(redactedValue).join('[REDACTED]');
    }

    return sanitizedValue as T;
  };

  return {
    ...span,
    name: scrubEcho(span.name),
    statusMessage: scrubEcho(span.statusMessage),
    attributes: sanitizedAttributes,
  };
}

function getProviderFetchOptions(
  spanOptions: Pick<
    FetchTraceContextOptions,
    'earliestStartTime' | 'includeInternalSpans' | 'maxSpans' | 'spanFilter'
  >,
  abortSignal?: AbortSignal,
): FetchTraceOptions | undefined {
  const requiresPostFetchFiltering =
    spanOptions.includeInternalSpans === false || Boolean(spanOptions.spanFilter?.length);
  const providerOptions = {
    ...(spanOptions.earliestStartTime !== undefined && {
      earliestStartTime: spanOptions.earliestStartTime,
    }),
    ...(spanOptions.maxSpans !== undefined &&
      !requiresPostFetchFiltering && { maxSpans: spanOptions.maxSpans }),
    ...(abortSignal && { abortSignal }),
  };

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

/**
 * Fetch trace context from an external provider (Tempo, Jaeger, etc.)
 */
async function fetchFromExternalProvider(
  traceId: string,
  providerConfig: TraceProviderConfig,
  options: {
    queryDelay: number;
    maxRetries: number;
    retryDelayMs: number;
    includeInternalSpans: boolean;
    sanitizeAttributes: boolean;
    earliestStartTime?: number;
    maxSpans?: number;
    maxDepth?: number;
    spanFilter?: string[];
    redactAttributes?: string[];
    abortSignal?: AbortSignal;
  },
): Promise<TraceContextData | null> {
  const { queryDelay, maxRetries, retryDelayMs, redactAttributes, abortSignal, ...spanOptions } =
    options;
  const providerFetchOptions = getProviderFetchOptions(spanOptions, abortSignal);

  let provider: ReturnType<typeof createTraceProvider>;
  try {
    provider = createTraceProvider(providerConfig);
  } catch (error) {
    logger.warn(`[TraceContext] Failed to initialize trace provider: ${error}`);
    return null;
  }

  if (queryDelay > 0) {
    logger.debug(`[TraceContext] Waiting ${queryDelay}ms for spans to arrive at external backend`);
    await waitForRetry(queryDelay, abortSignal);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw createTraceAbortError(abortSignal);
    }
    try {
      const result = await provider.fetchTrace(traceId, providerFetchOptions);
      const validSpans = result ? discardCyclicExternalSpans(result.spans) : [];

      if (!result || validSpans.length === 0) {
        if (attempt === maxRetries) {
          logger.debug(
            `[TraceContext] No spans found for trace ${traceId} from ${provider.id} after ${attempt + 1} attempts`,
          );
          return null;
        }
        logger.debug(
          `[TraceContext] No spans yet for trace ${traceId} from ${provider.id}, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await waitForRetry(retryDelayMs, abortSignal);
        continue;
      }

      const storedSpans = redactAttributes?.length
        ? validSpans.map((span) => redactExternalSpan(span, redactAttributes))
        : validSpans;

      if (!(await storeExternalSpans(traceId, storedSpans))) {
        return null;
      }

      const spans = await getTraceStore().getSpans(traceId, spanOptions);
      if (spans.length === 0) {
        return null;
      }

      const traceSpans = createTraceSpans(spans);
      const insights = deriveInsights(traceSpans);

      logger.debug(
        `[TraceContext] Resolved ${traceSpans.length} spans for trace ${traceId} from ${provider.id} with ${insights.length} insights`,
      );

      return {
        traceId,
        spans: traceSpans,
        insights,
        fetchedAt: result.fetchedAt,
      };
    } catch (error) {
      if (abortSignal?.aborted) {
        throw createTraceAbortError(abortSignal);
      }
      logger.error(`[TraceContext] Failed to fetch from ${provider.id}: ${error}`);
      if (attempt === maxRetries || (error instanceof TraceProviderError && !error.retryable)) {
        return null;
      }
      await waitForRetry(retryDelayMs, abortSignal);
    }
  }

  return null;
}

function createTraceAbortError(signal?: AbortSignal): Error {
  const error = new Error('cancelled by user') as Error & { cause?: unknown };
  error.cause = signal?.reason;
  error.name = 'AbortError';
  return error;
}

async function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw createTraceAbortError(signal);
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(createTraceAbortError(signal));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch trace context from local TraceStore (SQLite)
 */
async function fetchFromLocalStore(
  traceId: string,
  options: {
    maxRetries: number;
    retryDelayMs: number;
    includeInternalSpans: boolean;
    sanitizeAttributes: boolean;
    earliestStartTime?: number;
    maxSpans?: number;
    maxDepth?: number;
    spanFilter?: string[];
    redactAttributes?: string[];
    abortSignal?: AbortSignal;
  },
): Promise<TraceContextData | null> {
  const { maxRetries, retryDelayMs, abortSignal, redactAttributes, ...spanOptions } = options;
  const traceStore = getTraceStore();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw createTraceAbortError(abortSignal);
    }
    try {
      const spans = await traceStore.getSpans(traceId, spanOptions);

      if (spans.length === 0) {
        if (attempt === maxRetries) {
          logger.debug(
            `[TraceContext] No spans found for trace ${traceId} after ${attempt + 1} attempts`,
          );
          return null;
        }
        logger.debug(
          `[TraceContext] No spans yet for trace ${traceId}, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await waitForRetry(retryDelayMs, abortSignal);
        continue;
      }

      const traceSpans = createTraceSpans(
        redactAttributes?.length
          ? spans.map((span) => ({
              ...span,
              attributes: sanitizeTraceAttributes(span.attributes, {
                redactAttributes,
                sanitizeSensitiveAttributes: spanOptions.sanitizeAttributes,
              }),
            }))
          : spans,
      );
      const insights = deriveInsights(traceSpans);

      const context: TraceContextData = {
        traceId,
        spans: traceSpans,
        insights,
        fetchedAt: Date.now(),
      };

      logger.debug(
        `[TraceContext] Resolved ${traceSpans.length} spans for trace ${traceId} with ${insights.length} insights`,
      );

      return context;
    } catch (error) {
      if (abortSignal?.aborted) {
        throw createTraceAbortError(abortSignal);
      }
      logger.error(`[TraceContext] Failed to fetch spans for trace ${traceId}: ${error}`);
      if (attempt === maxRetries) {
        return null;
      }
      await waitForRetry(retryDelayMs, abortSignal);
    }
  }

  return null;
}

/**
 * Fetch trace context for a given trace ID.
 *
 * If an external provider is configured (Tempo, Jaeger, etc.), fetches from that backend.
 * Otherwise, fetches from the local TraceStore (SQLite).
 *
 * @param traceId - The W3C trace ID (32 hex chars)
 * @param options - Fetch options including provider config
 * @returns TraceContextData or null if not found
 */
export async function fetchTraceContext(
  traceId: string,
  options: FetchTraceContextOptions = {},
): Promise<TraceContextData | null> {
  const {
    includeInternalSpans = true,
    sanitizeAttributes = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    providerConfig,
    queryDelay = DEFAULT_QUERY_DELAY_MS,
    ...spanOptions
  } = options;

  const fetchOptions = {
    maxRetries,
    retryDelayMs,
    includeInternalSpans,
    sanitizeAttributes,
    ...spanOptions,
  };

  // If external provider is configured, use it
  if (isExternalTraceProvider(providerConfig)) {
    const externalConfig = providerConfig!;
    const requestOptions = {
      queryDelay,
      ...fetchOptions,
    };
    // Calls with an abort signal retain independent cancellation ownership.
    if (requestOptions.abortSignal) {
      return fetchFromExternalProvider(traceId, externalConfig, requestOptions);
    }

    const key = JSON.stringify({ traceId, ...requestOptions });
    let pending = inFlightExternalFetches.get(externalConfig);
    if (!pending) {
      pending = new Map();
      inFlightExternalFetches.set(externalConfig, pending);
    }
    const existing = pending.get(key);
    if (existing) {
      return existing;
    }
    const request = fetchFromExternalProvider(traceId, externalConfig, requestOptions).finally(() =>
      pending.delete(key),
    );
    pending.set(key, request);
    return request;
  }

  // Otherwise, use local TraceStore
  return fetchFromLocalStore(traceId, fetchOptions);
}
