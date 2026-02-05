import logger from '../logger';
import { sleep } from '../util/time';
import { getTraceStore, type SpanData, type TraceSpanQueryOptions } from './store';

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
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

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

export async function fetchTraceContext(
  traceId: string,
  options: FetchTraceContextOptions = {},
): Promise<TraceContextData | null> {
  const {
    includeInternalSpans = true,
    sanitizeAttributes = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    ...spanOptions
  } = options;

  const traceStore = getTraceStore();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const spans = await traceStore.getSpans(traceId, {
        includeInternalSpans,
        sanitizeAttributes,
        ...spanOptions,
      });

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
