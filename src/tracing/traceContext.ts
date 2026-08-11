import logger from '../logger';
import { createTraceProvider, isExternalTraceProvider } from './providers';
import { type TraceProviderConfig, TraceProviderError } from './providers/types';
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

  const computeDepth = (span: SpanData): number => {
    if (depthMap.has(span.spanId)) {
      return depthMap.get(span.spanId)!;
    }

    if (!span.parentSpanId || !spansById.has(span.parentSpanId)) {
      depthMap.set(span.spanId, 0);
      return 0;
    }

    const parentDepth = computeDepth(spansById.get(span.parentSpanId)!);
    const depth = parentDepth + 1;
    depthMap.set(span.spanId, depth);
    return depth;
  };

  spans.forEach((span) => computeDepth(span));

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

function matchesExternalSpanFilter(spanName: string, filters: string[]): boolean {
  return filters.some((filter) => {
    if (!filter.includes('*') && !filter.includes('?')) {
      return spanName.toLowerCase().includes(filter.toLowerCase());
    }

    const escapedFilter = filter.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    const globPattern = escapedFilter.replace(/\*/g, '.*').replace(/\\\?/g, '.');

    return new RegExp(`^${globPattern}$`, 'i').test(spanName);
  });
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
 * Apply reader-specific filtering and sanitization after the complete trace is persisted.
 */
function postProcessExternalSpans(
  spans: SpanData[],
  options: {
    includeInternalSpans: boolean;
    sanitizeAttributes: boolean;
    maxDepth?: number;
    maxSpans?: number;
    spanFilter?: string[];
    redactAttributes?: string[];
  },
): SpanData[] {
  const { includeInternalSpans, sanitizeAttributes, maxDepth, maxSpans, spanFilter } = options;
  let filtered = [...spans].sort(
    (left, right) => left.startTime - right.startTime || left.spanId.localeCompare(right.spanId),
  );

  filtered = filtered.filter((span) => {
    // Filter by internal spans
    if (!includeInternalSpans) {
      const kind = resolveSpanKind(span);
      if (kind === 'internal') {
        return false;
      }
    }

    // Preserve substring matching while supporting documented wildcard filters.
    if (spanFilter && spanFilter.length > 0) {
      if (!matchesExternalSpanFilter(span.name, spanFilter)) {
        return false;
      }
    }

    return true;
  });

  if (maxDepth !== undefined) {
    const spanMap = new Map(filtered.map((span) => [span.spanId, span]));
    const depthCache = new Map<string, number | null>();

    filtered = filtered.filter((span) => {
      const depth = computeSpanDepth(span, spanMap, depthCache);
      return depth !== null && depth < maxDepth;
    });
  }

  // Apply maxSpans limit
  if (maxSpans !== undefined && filtered.length > maxSpans) {
    filtered = filtered.slice(0, maxSpans);
  }

  // Sanitize attributes if requested
  if (sanitizeAttributes || options.redactAttributes?.length) {
    filtered = filtered.map((span) => ({
      ...span,
      attributes: sanitizeTraceAttributes(span.attributes, {
        redactAttributes: options.redactAttributes,
        sanitizeSensitiveAttributes: sanitizeAttributes,
      }),
    }));
  }

  return filtered;
}

/**
 * Store spans fetched from an external provider in the local database.
 * This allows the spans to be displayed in the UI and persisted.
 */
async function storeExternalSpans(traceId: string, spans: SpanData[]): Promise<void> {
  try {
    const traceStore = getTraceStore();
    const result = await traceStore.addSpans(traceId, spans, {
      warnIfMissingTrace: false,
    });
    if (result.stored) {
      logger.debug(`[TraceContext] Stored ${spans.length} spans from external provider`);
    }
  } catch (error) {
    // Non-fatal - continue with in-memory data
    logger.warn(`[TraceContext] Failed to store external spans: ${error}`);
  }
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
  const { queryDelay, maxRetries, retryDelayMs, ...fetchOptions } = options;

  let provider: ReturnType<typeof createTraceProvider>;
  try {
    provider = createTraceProvider(providerConfig);
  } catch (error) {
    logger.warn(`[TraceContext] Failed to initialize trace provider: ${error}`);
    return null;
  }

  if (queryDelay > 0) {
    logger.debug(`[TraceContext] Waiting ${queryDelay}ms for spans to arrive at external backend`);
    await waitForRetry(queryDelay, fetchOptions.abortSignal);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (fetchOptions.abortSignal?.aborted) {
      throw new Error('cancelled by user');
    }
    try {
      const providerOptions = {
        ...(fetchOptions.earliestStartTime !== undefined && {
          earliestStartTime: fetchOptions.earliestStartTime,
        }),
        ...(fetchOptions.abortSignal && { abortSignal: fetchOptions.abortSignal }),
      };
      const result = await provider.fetchTrace(
        traceId,
        Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
      );

      if (!result || result.spans.length === 0) {
        if (attempt === maxRetries) {
          logger.debug(
            `[TraceContext] No spans found for trace ${traceId} from ${provider.id} after ${attempt + 1} attempts`,
          );
          return null;
        }
        logger.debug(
          `[TraceContext] No spans yet for trace ${traceId} from ${provider.id}, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await waitForRetry(retryDelayMs, fetchOptions.abortSignal);
        continue;
      }

      const validSpans = discardCyclicExternalSpans(result.spans);
      const storedSpans = fetchOptions.redactAttributes?.length
        ? validSpans.map((span) => ({
            ...span,
            attributes: sanitizeTraceAttributes(span.attributes, {
              redactAttributes: fetchOptions.redactAttributes,
              sanitizeSensitiveAttributes: false,
              truncateValues: false,
            }),
          }))
        : validSpans;

      // Persist the complete trace before applying filters intended only for this reader.
      await storeExternalSpans(traceId, storedSpans);

      const processedSpans = postProcessExternalSpans(storedSpans, {
        includeInternalSpans: fetchOptions.includeInternalSpans,
        sanitizeAttributes: fetchOptions.sanitizeAttributes,
        maxDepth: fetchOptions.maxDepth,
        maxSpans: fetchOptions.maxSpans,
        spanFilter: fetchOptions.spanFilter,
        redactAttributes: fetchOptions.redactAttributes,
      });

      // Transform to TraceContextData format
      const traceSpans = createTraceSpans(processedSpans);
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
      if (fetchOptions.abortSignal?.aborted) {
        throw new Error('cancelled by user');
      }
      logger.error(`[TraceContext] Failed to fetch from ${provider.id}: ${error}`);
      if (attempt === maxRetries || (error instanceof TraceProviderError && !error.retryable)) {
        return null;
      }
      await waitForRetry(retryDelayMs, fetchOptions.abortSignal);
    }
  }

  return null;
}

async function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new Error('cancelled by user');
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('cancelled by user'));
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
      throw new Error('cancelled by user');
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
        throw new Error('cancelled by user');
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
