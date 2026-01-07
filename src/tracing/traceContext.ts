import logger from '../logger';
import { sleep } from '../util/time';
import { createTraceProvider, isExternalTraceProvider } from './providers';
import { getTraceStore, type SpanData, type TraceSpanQueryOptions } from './store';

import type { TraceProviderConfig } from './providers/types';

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
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_QUERY_DELAY_MS = 3000;

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

  const toolCalls = traceSpans.filter((span) => span.attributes['tool.name']);
  toolCalls.forEach((span) => {
    insights.push(
      `Tool call ${span.attributes['tool.name']} via "${span.name}" (duration ${span.durationMs ?? 0}ms)`,
    );
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
  if (parts.length < 2) {
    return null;
  }

  return parts[1];
}

/**
 * Sensitive attribute keys that should be redacted
 */
const SENSITIVE_ATTRIBUTE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passphrase',
];

/**
 * Sanitize attributes by redacting sensitive values and truncating long strings
 */
function sanitizeSpanAttributes(
  attributes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!attributes) {
    return {};
  }

  const sanitizeValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.length > 400 ? `${value.slice(0, 400)}…` : value;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
      return sanitizeSpanAttributes(value as Record<string, unknown>);
    }
    return value;
  };

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_ATTRIBUTE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
      sanitized[key] = '<redacted>';
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}

/**
 * Derive span kind from attributes
 */
function deriveSpanKindFromAttributes(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) {
    return 'internal';
  }
  const attributeKind = (attributes['span.kind'] ||
    attributes['otel.span.kind'] ||
    attributes['spanKind']) as string | undefined;

  if (typeof attributeKind === 'string') {
    return attributeKind.toLowerCase();
  }

  return 'internal';
}

/**
 * Compute the depth of a span in the span tree
 */
function computeSpanDepth(
  span: SpanData,
  spanMap: Map<string, SpanData>,
  depthCache: Map<string, number>,
): number {
  if (depthCache.has(span.spanId)) {
    return depthCache.get(span.spanId)!;
  }

  if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
    depthCache.set(span.spanId, 0);
    return 0;
  }

  const parentDepth = computeSpanDepth(spanMap.get(span.parentSpanId)!, spanMap, depthCache);
  const currentDepth = parentDepth + 1;
  depthCache.set(span.spanId, currentDepth);
  return currentDepth;
}

/**
 * Post-process spans from external providers to apply filtering and sanitization.
 * This ensures consistent behavior with the local TraceStore.
 */
function postProcessExternalSpans(
  spans: SpanData[],
  options: {
    includeInternalSpans: boolean;
    sanitizeAttributes: boolean;
    maxDepth?: number;
    maxSpans?: number;
    spanFilter?: string[];
  },
): SpanData[] {
  const { includeInternalSpans, sanitizeAttributes, maxDepth, maxSpans, spanFilter } = options;

  // Build span map for depth calculation
  const spanMap = new Map<string, SpanData>();
  for (const span of spans) {
    spanMap.set(span.spanId, span);
  }
  const depthCache = new Map<string, number>();

  let filtered = spans.filter((span) => {
    // Filter by internal spans
    if (!includeInternalSpans) {
      const kind = deriveSpanKindFromAttributes(span.attributes);
      if (kind === 'internal') {
        return false;
      }
    }

    // Filter by span name (substring match, case-insensitive - matches local store behavior)
    if (spanFilter && spanFilter.length > 0) {
      const matchesFilter = spanFilter.some((filterName) =>
        span.name.toLowerCase().includes(filterName.toLowerCase()),
      );
      if (!matchesFilter) {
        return false;
      }
    }

    // Filter by depth
    if (maxDepth !== undefined) {
      const depth = computeSpanDepth(span, spanMap, depthCache);
      if (depth >= maxDepth) {
        return false;
      }
    }

    return true;
  });

  // Apply maxSpans limit
  if (maxSpans !== undefined && filtered.length > maxSpans) {
    filtered = filtered.slice(0, maxSpans);
  }

  // Sanitize attributes if requested
  if (sanitizeAttributes) {
    filtered = filtered.map((span) => ({
      ...span,
      attributes: sanitizeSpanAttributes(span.attributes) as Record<string, unknown>,
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
    await traceStore.addSpans(traceId, spans, { skipTraceCheck: true });
    logger.debug(`[TraceContext] Stored ${spans.length} spans from external provider`);
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
  },
): Promise<TraceContextData | null> {
  const { queryDelay, maxRetries, retryDelayMs, ...fetchOptions } = options;

  // Wait for spans to arrive at external backend
  if (queryDelay > 0) {
    logger.debug(`[TraceContext] Waiting ${queryDelay}ms for spans to arrive at external backend`);
    await sleep(queryDelay);
  }

  const provider = createTraceProvider(providerConfig);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await provider.fetchTrace(traceId, {
        earliestStartTime: fetchOptions.earliestStartTime,
        maxSpans: fetchOptions.maxSpans,
        maxDepth: fetchOptions.maxDepth,
        spanFilter: fetchOptions.spanFilter,
        sanitizeAttributes: fetchOptions.sanitizeAttributes,
      });

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
        await sleep(retryDelayMs);
        continue;
      }

      // Apply post-processing to match local TraceStore behavior
      const processedSpans = postProcessExternalSpans(result.spans, {
        includeInternalSpans: fetchOptions.includeInternalSpans,
        sanitizeAttributes: fetchOptions.sanitizeAttributes,
        maxDepth: fetchOptions.maxDepth,
        maxSpans: fetchOptions.maxSpans,
        spanFilter: fetchOptions.spanFilter,
      });

      // Store fetched spans in local database for persistence and UI display
      await storeExternalSpans(traceId, processedSpans);

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
      logger.error(`[TraceContext] Failed to fetch from ${provider.id}: ${error}`);
      if (attempt === maxRetries) {
        return null;
      }
      await sleep(retryDelayMs);
    }
  }

  return null;
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
  },
): Promise<TraceContextData | null> {
  const { maxRetries, retryDelayMs, ...spanOptions } = options;
  const traceStore = getTraceStore();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        await sleep(retryDelayMs);
        continue;
      }

      const traceSpans = createTraceSpans(spans);
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
      logger.error(`[TraceContext] Failed to fetch spans for trace ${traceId}: ${error}`);
      if (attempt === maxRetries) {
        return null;
      }
      await sleep(retryDelayMs);
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
    return fetchFromExternalProvider(traceId, providerConfig!, {
      queryDelay,
      ...fetchOptions,
    });
  }

  // Otherwise, use local TraceStore
  return fetchFromLocalStore(traceId, fetchOptions);
}
