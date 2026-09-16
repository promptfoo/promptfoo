import { isDeepStrictEqual } from 'node:util';

import { parseOtlpAttributes } from '../otlpAttributes';
import { mergeResourceAttributes } from '../resourceAttributes';
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

interface TempoAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  bytesValue?: string;
  arrayValue?: { values?: TempoAttributeValue[] };
  kvlistValue?: { values?: Array<{ key: string; value: TempoAttributeValue }> };
}

interface TempoSpan {
  traceId?: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number | string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: TempoAttributeValue }>;
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  events?: Array<{
    name: string;
    timeUnixNano?: string;
    attributes?: Array<{ key: string; value: TempoAttributeValue }>;
    droppedAttributesCount?: number;
  }>;
  status?: { code?: number | string; message?: string };
}

interface TempoTraceResponse {
  batches?: Array<{
    resource?: {
      attributes?: Array<{ key: string; value: TempoAttributeValue }>;
      droppedAttributesCount?: number;
    };
    scopeSpans?: Array<{
      scope?: { name?: string; version?: string; droppedAttributesCount?: number };
      spans?: TempoSpan[];
    }>;
  }>;
}

const SPAN_KIND_NAMES = ['unspecified', 'internal', 'server', 'client', 'producer', 'consumer'];
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const BASE64_TRACE_ID_PATTERN = /^[A-Za-z0-9+/]{22}(?:==)?$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/i;
const BASE64_SPAN_ID_PATTERN = /^[A-Za-z0-9+/]{11}=?$/;
function nanoToMs(value: string): number {
  if (
    typeof value !== 'string' ||
    !/^\d{1,20}$/.test(value) ||
    BigInt(value) > 0xffffffffffffffffn
  ) {
    throw new Error('Span timestamp must be an unsigned 64-bit nanosecond value');
  }
  const nanos = BigInt(value);
  const milliseconds = Number.parseInt((nanos / 1_000_000n).toString(), 10);
  const remainder = Number.parseInt((nanos % 1_000_000n).toString(), 10);
  return milliseconds + remainder / 1_000_000;
}

function attributesToRecord(
  attributes?: Array<{ key: string; value: TempoAttributeValue }>,
): Record<string, unknown> {
  try {
    return parseOtlpAttributes(attributes);
  } catch (error) {
    throw new TraceProviderError(
      error instanceof Error ? error.message : 'Tempo attribute decoding failed',
      { invalidEvidence: true },
    );
  }
}

function decodeSpanId(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  if (SPAN_ID_PATTERN.test(id)) {
    return /^0+$/.test(id) ? undefined : id.toLowerCase();
  }

  if (!BASE64_SPAN_ID_PATTERN.test(id)) {
    return undefined;
  }

  const decoded = Buffer.from(id, 'base64');
  if (
    decoded.length !== 8 ||
    decoded.toString('base64').replace(/=+$/, '') !== id.replace(/=+$/, '')
  ) {
    return undefined;
  }

  const spanId = decoded.toString('hex');
  return /^0+$/.test(spanId) ? undefined : spanId;
}

function decodeTraceId(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  if (TRACE_ID_PATTERN.test(id)) {
    return /^0+$/.test(id) ? undefined : id.toLowerCase();
  }

  if (!BASE64_TRACE_ID_PATTERN.test(id)) {
    return undefined;
  }

  const decoded = Buffer.from(id, 'base64');
  if (
    decoded.length !== 16 ||
    decoded.toString('base64').replace(/=+$/, '') !== id.replace(/=+$/, '')
  ) {
    return undefined;
  }

  const traceId = decoded.toString('hex');
  return /^0+$/.test(traceId) ? undefined : traceId;
}

function normalizeStatusCode(code: number | string | undefined): number | undefined {
  if (typeof code === 'number') {
    return code;
  }
  if (!code) {
    return undefined;
  }
  const numeric = Number(code);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  switch (code.toUpperCase()) {
    case 'STATUS_CODE_OK':
    case 'OK':
      return 1;
    case 'STATUS_CODE_ERROR':
    case 'ERROR':
      return 2;
    case 'STATUS_CODE_UNSET':
    case 'UNSET':
      return 0;
    default:
      return undefined;
  }
}

function transformSpan(
  span: TempoSpan,
  traceId: string,
  resourceAttributes: Record<string, unknown>,
  scopeName: string | undefined,
): SpanData | null {
  const spanTraceId = decodeTraceId(span.traceId);
  if (!spanTraceId) {
    throw new Error('Span trace ID must be a valid nonzero sixteen-byte identifier');
  }
  if (spanTraceId !== traceId.toLowerCase()) {
    return null;
  }

  const spanId = decodeSpanId(span.spanId);
  if (!spanId) {
    throw new Error('Span ID must be a valid nonzero eight-byte identifier');
  }

  const parentSpanId = decodeSpanId(span.parentSpanId);
  if (span.parentSpanId && !parentSpanId) {
    throw new Error('Parent span ID must be a valid nonzero eight-byte identifier');
  }

  if (typeof span.name !== 'string' || span.name.trim().length === 0) {
    throw new Error('Span name must be a nonempty string');
  }
  if (span.status?.message !== undefined && typeof span.status.message !== 'string') {
    throw new Error('Span status message must be a string');
  }

  if (span.events !== undefined && !Array.isArray(span.events)) {
    throw new Error('Tempo span events must be an array');
  }

  const startTime = nanoToMs(span.startTimeUnixNano);
  const endTimeUnixNano = span.endTimeUnixNano;
  const endTime = endTimeUnixNano ? nanoToMs(endTimeUnixNano) : undefined;
  if (endTimeUnixNano && BigInt(endTimeUnixNano) < BigInt(span.startTimeUnixNano)) {
    throw new Error('Span end time must not precede its start time');
  }

  return {
    spanId,
    parentSpanId,
    name: span.name,
    startTime,
    endTime,
    attributes: mergeResourceAttributes(resourceAttributes, {
      ...attributesToRecord(span.attributes),
      'otel.span.start_time_unix_nano': span.startTimeUnixNano,
      'otel.span.end_time_unix_nano': endTimeUnixNano,
      ...(scopeName && { 'otel.scope.name': scopeName }),
      ...(typeof span.kind === 'number' && {
        'otel.span.kind': SPAN_KIND_NAMES[span.kind] ?? 'unspecified',
        'otel.span.kind_code': span.kind,
      }),
      ...(typeof span.kind === 'string' && {
        'otel.span.kind': span.kind.replace(/^SPAN_KIND_/i, '').toLowerCase(),
      }),
    }),
    statusCode: normalizeStatusCode(span.status?.code),
    statusMessage: span.status?.message,
    events: span.events?.map((event) => {
      if (
        !event ||
        typeof event.name !== 'string' ||
        !event.name.trim() ||
        !event.timeUnixNano ||
        /^0+$/.test(event.timeUnixNano)
      ) {
        throw new Error('Tempo event must have a name and a valid timestamp');
      }
      return {
        name: event.name,
        timestamp: nanoToMs(event.timeUnixNano),
        timestampNanos: event.timeUnixNano,
        attributes: attributesToRecord(event.attributes),
      };
    }),
  };
}

export class TempoProvider implements TraceProvider {
  readonly id = 'tempo';
  private readonly baseUrl: string;

  constructor(private readonly config: TraceProviderConfig) {
    if (!config.endpoint) {
      throw new Error('Tempo provider requires endpoint configuration');
    }

    validateTraceProviderEndpoint(config.endpoint, 'Tempo');
    if (
      config.timeout !== undefined &&
      (!Number.isSafeInteger(config.timeout) || config.timeout <= 0)
    ) {
      throw new Error('Tempo provider timeout must be a positive integer');
    }
    this.baseUrl = config.endpoint.replace(/\/$/, '');
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.config.headers };
    const hasConfiguredAuthentication = Boolean(
      this.config.auth?.token || (this.config.auth?.username && this.config.auth?.password),
    );
    for (const header of Object.keys(headers)) {
      const normalizedHeader = header.toLowerCase();
      if (
        normalizedHeader === 'accept' ||
        (hasConfiguredAuthentication && normalizedHeader === 'authorization')
      ) {
        delete headers[header];
      }
    }
    headers.Accept = 'application/json';
    if (this.config.auth?.token) {
      headers.Authorization = `Bearer ${this.config.auth.token}`;
    } else if (this.config.auth?.username && this.config.auth?.password) {
      const credentials = Buffer.from(
        `${this.config.auth.username}:${this.config.auth.password}`,
      ).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }
    return headers;
  }

  private transformSpans(body: string, traceId: string): SpanData[] {
    const spans = new Map<string, SpanData>();
    try {
      const data = JSON.parse(body) as TempoTraceResponse;
      if (!data || !Array.isArray(data.batches)) {
        throw new Error('Tempo returned an invalid trace response');
      }
      for (const batch of data.batches) {
        if (!batch || !Array.isArray(batch.scopeSpans)) {
          throw new Error('Tempo batch must contain a scopeSpans array');
        }
        const resourceAttributes = attributesToRecord(batch.resource?.attributes);
        for (const scopeSpan of batch.scopeSpans) {
          if (!scopeSpan || !Array.isArray(scopeSpan.spans)) {
            throw new Error('Tempo scope must contain a spans array');
          }
          for (const span of scopeSpan.spans) {
            const normalized = transformSpan(
              span,
              traceId,
              resourceAttributes,
              scopeSpan.scope?.name,
            );
            if (!normalized) {
              continue;
            }
            if (
              [
                batch.resource?.droppedAttributesCount,
                scopeSpan.scope?.droppedAttributesCount,
                span.droppedAttributesCount,
                span.droppedEventsCount,
              ].some((count) => (count ?? 0) > 0) ||
              span.events?.some((event) => (event.droppedAttributesCount ?? 0) > 0)
            ) {
              throw new Error('Tempo returned incomplete trace data: dropped telemetry');
            }
            const previous = spans.get(normalized.spanId);
            if (previous && !isDeepStrictEqual(previous, normalized)) {
              throw new Error('Tempo returned conflicting records for one span ID');
            }
            spans.set(normalized.spanId, normalized);
          }
        }
      }
    } catch (error) {
      if (error instanceof TraceProviderError) {
        throw error;
      }
      throw new TraceProviderError(
        error instanceof Error ? error.message : 'Tempo trace decoding failed',
        { invalidEvidence: true },
      );
    }
    return [...spans.values()];
  }

  async fetchTrace(traceId: string, options?: FetchTraceOptions): Promise<FetchTraceResult | null> {
    if (!TRACE_ID_PATTERN.test(traceId) || /^0+$/.test(traceId)) {
      throw new TraceProviderError('Trace ID must contain 32 hexadecimal characters');
    }

    const timeoutSignal = AbortSignal.timeout(this.config.timeout ?? 10_000);
    const signal = options?.abortSignal
      ? AbortSignal.any([timeoutSignal, options.abortSignal])
      : timeoutSignal;
    const response = await fetchWithProxy(`${this.baseUrl}/api/traces/${traceId}`, {
      disableTransientRetries: true,
      method: 'GET',
      headers: this.buildHeaders(),
      redirect: 'error',
      signal,
    });

    if (response.status === 404) {
      await releaseResponse(response, 'Tempo');
      return null;
    }
    if (!response.ok) {
      await releaseResponse(response, 'Tempo');
      throw new TraceProviderError(`Tempo returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_TRACE_RESPONSE_BYTES) {
      await releaseResponse(response, 'Tempo');
      throw new TraceProviderError('Tempo trace exceeds the maximum response size', {
        limitExceeded: true,
      });
    }
    const body = await readLimitedResponse(response, 'Tempo');
    const spans = this.transformSpans(body, traceId);
    const services = new Set<string>();
    for (const span of spans) {
      const service = span.attributes?.['service.name'];
      if (typeof service === 'string') {
        services.add(service);
      }
    }

    return {
      traceId,
      spans,
      services: [...services],
      fetchedAt: Date.now(),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetchWithProxy(`${this.baseUrl}/ready`, {
        headers: this.buildHeaders(),
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      await releaseResponse(response, 'Tempo');
      return response.ok;
    } catch {
      return false;
    }
  }
}
