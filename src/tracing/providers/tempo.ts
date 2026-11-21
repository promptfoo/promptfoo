import logger from '../../logger';
import {
  fetchWithProxy,
  readLimitedResponse,
  releaseResponse,
  validateTraceProviderEndpoint,
} from './fetch';
import { IncompleteTraceError, TraceProviderError } from './types';

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
  status?: { code?: number | string; message?: string };
  droppedAttributesCount?: unknown;
  droppedEventsCount?: unknown;
  droppedLinksCount?: unknown;
  events?: Array<{ droppedAttributesCount?: unknown }>;
  links?: Array<{ droppedAttributesCount?: unknown }>;
}

interface TempoTraceResponse {
  batches?: Array<{
    resource?: {
      attributes?: Array<{ key: string; value: TempoAttributeValue }>;
      droppedAttributesCount?: unknown;
    };
    scopeSpans?: Array<{
      scope?: { name?: string; version?: string; droppedAttributesCount?: unknown };
      spans?: TempoSpan[];
    }>;
  }>;
}

const MAX_SPANS = 10_000;
const SPAN_KIND_NAMES = ['unspecified', 'internal', 'server', 'client', 'producer', 'consumer'];
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const BASE64_TRACE_ID_PATTERN = /^[A-Za-z0-9+/]{22}(?:==)?$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/i;
const BASE64_SPAN_ID_PATTERN = /^[A-Za-z0-9+/]{11}=?$/;
function nanoToMs(value: string): number {
  const milliseconds = BigInt(value) / 1_000_000n;
  if (milliseconds < 0n || milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Span timestamp is outside the supported range');
  }
  return Number.parseInt(milliseconds.toString(), 10);
}

function extractAttributeValue(value: TempoAttributeValue): unknown {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.intValue !== undefined) {
    const number = Number(value.intValue);
    return Number.isSafeInteger(number) ? number : value.intValue;
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.bytesValue !== undefined) {
    return value.bytesValue;
  }
  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map(extractAttributeValue);
  }
  if (value.kvlistValue) {
    return attributesToRecord(value.kvlistValue.values);
  }
  return undefined;
}

function attributesToRecord(
  attributes?: Array<{ key: string; value: TempoAttributeValue }>,
): Record<string, unknown> {
  return Object.fromEntries(
    (attributes ?? []).map(({ key, value }) => [key, extractAttributeValue(value)]),
  );
}

function assertNoDroppedTelemetry(...counts: unknown[]): void {
  const incomplete = counts.some((count) => {
    if (count == null || count === 0) {
      return false;
    }
    return (
      typeof count !== 'string' ||
      !/^[ \t\r\n]*-?0(?:\.0+)?(?:[eE][+-]?\d+)?[ \t\r\n]*$/.test(count)
    );
  });
  if (incomplete) {
    throw new IncompleteTraceError('Tempo returned incomplete trace data: dropped telemetry');
  }
}

function decodeId(
  id: string | undefined,
  hexPattern: RegExp,
  base64Pattern: RegExp,
  byteLength: number,
): string | undefined {
  if (typeof id !== 'string' || !id) {
    return undefined;
  }

  if (hexPattern.test(id)) {
    return /^0+$/.test(id) ? undefined : id.toLowerCase();
  }

  if (!base64Pattern.test(id)) {
    return undefined;
  }

  const decoded = Buffer.from(id, 'base64');
  if (
    decoded.length !== byteLength ||
    decoded.toString('base64').replace(/=+$/, '') !== id.replace(/=+$/, '')
  ) {
    return undefined;
  }

  const hexId = decoded.toString('hex');
  return /^0+$/.test(hexId) ? undefined : hexId;
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

function assertCompleteSpan(span: TempoSpan) {
  assertNoDroppedTelemetry(
    span.droppedAttributesCount,
    span.droppedEventsCount,
    span.droppedLinksCount,
  );
  for (const records of [span.events, span.links]) {
    if (records == null) {
      continue;
    }
    if (!Array.isArray(records)) {
      throw new IncompleteTraceError('Tempo span events and links must be arrays');
    }
    for (const record of records) {
      assertNoDroppedTelemetry(record?.droppedAttributesCount);
    }
  }
}

function transformSpan(
  span: TempoSpan,
  spanId: string,
  resourceAttributes: Record<string, unknown>,
  scopeName: string | undefined,
): SpanData {
  const parentSpanId = decodeId(span.parentSpanId, SPAN_ID_PATTERN, BASE64_SPAN_ID_PATTERN, 8);
  if (span.parentSpanId && !parentSpanId) {
    throw new Error('Parent span ID must be a valid nonzero eight-byte identifier');
  }

  if (typeof span.name !== 'string' || span.name.trim().length === 0) {
    throw new Error('Span name must be a nonempty string');
  }
  if (span.status?.message !== undefined && typeof span.status.message !== 'string') {
    throw new Error('Span status message must be a string');
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
    attributes: {
      ...resourceAttributes,
      ...attributesToRecord(span.attributes),
      ...(scopeName && { 'otel.scope.name': scopeName }),
      ...(typeof span.kind === 'number' && {
        'otel.span.kind': SPAN_KIND_NAMES[span.kind] ?? 'unspecified',
        'otel.span.kind_code': span.kind,
      }),
      ...(typeof span.kind === 'string' && {
        'otel.span.kind': span.kind.replace(/^SPAN_KIND_/i, '').toLowerCase(),
      }),
    },
    statusCode: normalizeStatusCode(span.status?.code),
    statusMessage: span.status?.message,
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

  private transformSpans(data: TempoTraceResponse, traceId: string): SpanData[] {
    const spans = new Map<string, SpanData | null>();
    const requestedId = traceId.toLowerCase();
    let malformedSpans = 0;

    for (const batch of data.batches ?? []) {
      const resourceCount = batch?.resource?.droppedAttributesCount;
      if (!Array.isArray(batch?.scopeSpans) || batch.scopeSpans.length === 0) {
        // Without children we cannot establish that the lost telemetry belongs elsewhere.
        assertNoDroppedTelemetry(resourceCount);
        malformedSpans++;
        continue;
      }
      let resourceAttributes: Record<string, unknown> | undefined;
      for (const scopeSpan of batch.scopeSpans) {
        const scopeCount = scopeSpan?.scope?.droppedAttributesCount;
        if (!Array.isArray(scopeSpan?.spans) || scopeSpan.spans.length === 0) {
          assertNoDroppedTelemetry(resourceCount, scopeCount);
          malformedSpans++;
          continue;
        }
        const matching = scopeSpan.spans.filter(
          (span) =>
            decodeId(span?.traceId, TRACE_ID_PATTERN, BASE64_TRACE_ID_PATTERN, 16) === requestedId,
        );
        malformedSpans += scopeSpan.spans.length - matching.length;
        if (!matching.length) {
          continue;
        }
        if (!resourceAttributes) {
          assertNoDroppedTelemetry(resourceCount);
          resourceAttributes = attributesToRecord(batch.resource?.attributes);
        }
        assertNoDroppedTelemetry(scopeCount);
        for (const span of matching) {
          assertCompleteSpan(span);
          const id = decodeId(span.spanId, SPAN_ID_PATTERN, BASE64_SPAN_ID_PATTERN, 8);
          if (!id) {
            malformedSpans++;
            continue;
          }
          if (spans.get(id)) {
            continue;
          }
          if (!spans.has(id) && spans.size >= MAX_SPANS) {
            throw new IncompleteTraceError('Tempo trace exceeds the maximum span count');
          }
          try {
            spans.set(id, transformSpan(span, id, resourceAttributes, scopeSpan.scope?.name));
          } catch {
            // Count a distinct valid ID even if another field is malformed. A valid
            // duplicate can still supply its data.
            spans.set(id, null);
            malformedSpans++;
          }
        }
      }
    }

    if (malformedSpans > 0) {
      logger.warn(`[TempoProvider] Skipped ${malformedSpans} malformed spans`);
    }

    return [...spans.values()].filter((span) => span !== null);
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
    const body = await readLimitedResponse(response, 'Tempo');
    // JSON numbers like 1e-400 round to zero. Preserve the token for the same
    // exact zero check as quoted OTLP counters, after selecting the requested trace.
    const data = JSON.parse(body, (key, value, context?: { source: string }) =>
      value === 0 && /^dropped(Attributes|Events|Links)Count$/.test(key)
        ? (context?.source ?? value)
        : value,
    ) as TempoTraceResponse;
    if (!Array.isArray(data.batches)) {
      throw new TraceProviderError('Tempo returned an invalid trace response');
    }

    const spans = this.transformSpans(data, traceId);
    return {
      spans,
      fetchedAt: Date.now(),
    };
  }
}
