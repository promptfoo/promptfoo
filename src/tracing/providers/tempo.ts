import { fetchWithCache } from '../../cache';
import logger from '../../logger';

import type { SpanData } from '../store';
import type {
  FetchTraceOptions,
  FetchTraceResult,
  TraceProvider,
  TraceProviderConfig,
} from './types';

/**
 * Tempo API response format (OTLP JSON)
 * See: https://grafana.com/docs/tempo/latest/api_docs/
 */
interface TempoResourceSpan {
  resource: {
    attributes: Array<{ key: string; value: TempoAttributeValue }>;
  };
  scopeSpans: Array<{
    scope?: {
      name?: string;
      version?: string;
    };
    spans: TempoSpan[];
  }>;
}

interface TempoSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: TempoAttributeValue }>;
  status?: {
    code?: number;
    message?: string;
  };
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes?: Array<{ key: string; value: TempoAttributeValue }>;
  }>;
}

interface TempoAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: TempoAttributeValue[] };
  kvlistValue?: { values: Array<{ key: string; value: TempoAttributeValue }> };
}

interface TempoTraceResponse {
  batches: TempoResourceSpan[];
}

/**
 * Convert nanoseconds (as string) to milliseconds
 */
function nanoToMs(nanoStr: string): number {
  const nanos = BigInt(nanoStr);
  return Number(nanos / BigInt(1_000_000));
}

/**
 * Extract a primitive value from Tempo's attribute value format
 */
function extractAttributeValue(value: TempoAttributeValue): string | number | boolean | unknown[] {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.intValue !== undefined) {
    return parseInt(value.intValue, 10);
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.arrayValue) {
    return value.arrayValue.values.map(extractAttributeValue);
  }
  return String(value);
}

/**
 * Convert Tempo attributes array to a Record
 */
function attributesToRecord(
  attrs?: Array<{ key: string; value: TempoAttributeValue }>,
): Record<string, unknown> {
  if (!attrs) {
    return {};
  }
  const record: Record<string, unknown> = {};
  for (const attr of attrs) {
    record[attr.key] = extractAttributeValue(attr.value);
  }
  return record;
}

/**
 * Decode hex-encoded or base64-encoded span/trace IDs to hex
 */
function decodeId(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  // If already hex (only contains hex chars), return as-is
  if (/^[0-9a-fA-F]+$/.test(id)) {
    return id.toLowerCase();
  }
  // Try base64 decode
  try {
    const buffer = Buffer.from(id, 'base64');
    return buffer.toString('hex').toLowerCase();
  } catch {
    return id.toLowerCase();
  }
}

/**
 * Grafana Tempo trace provider.
 * Queries Tempo's HTTP API to retrieve traces by ID.
 */
export class TempoProvider implements TraceProvider {
  readonly id = 'tempo';
  private readonly config: TraceProviderConfig;
  private readonly baseUrl: string;

  constructor(config: TraceProviderConfig) {
    this.config = config;
    if (!config.endpoint) {
      throw new Error('Tempo provider requires endpoint configuration');
    }
    this.baseUrl = config.endpoint.replace(/\/$/, '');
  }

  /**
   * Build request headers including auth if configured
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.config.headers,
    };

    if (this.config.auth?.token) {
      headers['Authorization'] = `Bearer ${this.config.auth.token}`;
    } else if (this.config.auth?.username && this.config.auth?.password) {
      const credentials = Buffer.from(
        `${this.config.auth.username}:${this.config.auth.password}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  /**
   * Transform Tempo response to SpanData array
   */
  private transformSpans(data: TempoTraceResponse, options?: FetchTraceOptions): SpanData[] {
    const spans: SpanData[] = [];

    for (const batch of data.batches || []) {
      const resourceAttrs = attributesToRecord(batch.resource?.attributes);
      const serviceName = resourceAttrs['service.name'] as string | undefined;

      for (const scopeSpan of batch.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          const startTime = nanoToMs(span.startTimeUnixNano);
          const endTime = span.endTimeUnixNano ? nanoToMs(span.endTimeUnixNano) : undefined;

          // Apply earliestStartTime filter
          if (options?.earliestStartTime && startTime < options.earliestStartTime) {
            continue;
          }

          const attributes = {
            ...resourceAttrs,
            ...attributesToRecord(span.attributes),
            ...(serviceName && { 'service.name': serviceName }),
            ...(scopeSpan.scope?.name && { 'otel.scope.name': scopeSpan.scope.name }),
            ...(span.kind !== undefined && { 'otel.span.kind_code': span.kind }),
          };

          // Apply span name filter if provided
          if (options?.spanFilter && options.spanFilter.length > 0) {
            const nameMatches = options.spanFilter.some((pattern) => {
              const regex = new RegExp(
                '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
                'i',
              );
              return regex.test(span.name);
            });
            if (!nameMatches) {
              continue;
            }
          }

          spans.push({
            spanId: decodeId(span.spanId) || span.spanId,
            parentSpanId: decodeId(span.parentSpanId),
            name: span.name,
            startTime,
            endTime,
            attributes,
            statusCode: span.status?.code,
            statusMessage: span.status?.message,
          });
        }
      }
    }

    // Apply maxSpans limit
    if (options?.maxSpans && spans.length > options.maxSpans) {
      return spans.slice(0, options.maxSpans);
    }

    return spans;
  }

  /**
   * Extract unique service names from the trace
   */
  private extractServices(data: TempoTraceResponse): string[] {
    const services = new Set<string>();
    for (const batch of data.batches || []) {
      const attrs = attributesToRecord(batch.resource?.attributes);
      const serviceName = attrs['service.name'];
      if (typeof serviceName === 'string') {
        services.add(serviceName);
      }
    }
    return Array.from(services);
  }

  async fetchTrace(traceId: string, options?: FetchTraceOptions): Promise<FetchTraceResult | null> {
    const url = `${this.baseUrl}/api/traces/${traceId}`;

    logger.debug(`[TempoProvider] Fetching trace ${traceId} from ${url}`);

    try {
      const response = await fetchWithCache<TempoTraceResponse>(
        url,
        {
          method: 'GET',
          headers: this.buildHeaders(),
        },
        this.config.timeout || 10000,
        'json',
        true, // Always bust cache - traces should be fresh
      );

      if (response.status === 404) {
        logger.debug(`[TempoProvider] Trace ${traceId} not found (404)`);
        return null;
      }

      if (response.status !== 200) {
        logger.warn(
          `[TempoProvider] Unexpected status ${response.status} for trace ${traceId}: ${response.statusText}`,
        );
        return null;
      }

      const spans = this.transformSpans(response.data, options);

      logger.debug(`[TempoProvider] Retrieved ${spans.length} spans for trace ${traceId}`);

      return {
        traceId,
        spans,
        services: this.extractServices(response.data),
        fetchedAt: Date.now(),
      };
    } catch (error) {
      logger.error(`[TempoProvider] Failed to fetch trace ${traceId}: ${error}`);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetchWithCache(
        `${this.baseUrl}/ready`,
        {
          method: 'GET',
          headers: this.buildHeaders(),
        },
        5000,
        'text',
        true,
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
