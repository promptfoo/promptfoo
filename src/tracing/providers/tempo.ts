import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
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
  status?: { code?: number | string; message?: string };
}

interface TempoTraceResponse {
  batches?: Array<{
    resource?: { attributes?: Array<{ key: string; value: TempoAttributeValue }> };
    scopeSpans?: Array<{
      scope?: { name?: string; version?: string };
      spans?: TempoSpan[];
    }>;
  }>;
}

type TempoBatch = NonNullable<TempoTraceResponse['batches']>[number];
type TempoScopeSpan = NonNullable<TempoBatch['scopeSpans']>[number];

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_SPANS = 10_000;
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

function matchesSpanFilter(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\\\?/g, '.')}$`, 'i').test(name);
  });
}

function transformSpan(
  span: TempoSpan,
  traceId: string,
  resourceAttributes: Record<string, unknown>,
  scopeName: string | undefined,
  options?: FetchTraceOptions,
): SpanData | null {
  if (decodeTraceId(span.traceId) !== traceId.toLowerCase()) {
    throw new Error('Span trace ID must match the requested trace');
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

  const startTime = nanoToMs(span.startTimeUnixNano);
  if (options?.earliestStartTime !== undefined && startTime < options.earliestStartTime) {
    return null;
  }
  if (options?.spanFilter?.length && !matchesSpanFilter(span.name, options.spanFilter)) {
    return null;
  }
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
      ...(typeof span.kind === 'number' && { 'otel.span.kind_code': span.kind }),
      ...(typeof span.kind === 'string' && {
        'otel.span.kind': span.kind.replace(/^SPAN_KIND_/i, '').toLowerCase(),
      }),
    },
    statusCode: normalizeStatusCode(span.status?.code),
    statusMessage: span.status?.message,
  };
}

function* getValidResourceScopes(data: TempoTraceResponse): Generator<{
  resourceAttributes: Record<string, unknown>;
  scopeSpan: TempoScopeSpan;
}> {
  for (const batch of data.batches ?? []) {
    let resourceAttributes: Record<string, unknown>;
    try {
      resourceAttributes = attributesToRecord(batch.resource?.attributes);
    } catch (error) {
      logger.warn(`[TempoProvider] Skipping batch with malformed resource attributes: ${error}`);
      continue;
    }
    if (batch.scopeSpans !== undefined && !Array.isArray(batch.scopeSpans)) {
      logger.warn('[TempoProvider] Skipping batch with a malformed scope collection');
      continue;
    }

    for (const scopeSpan of batch.scopeSpans ?? []) {
      if (
        !scopeSpan ||
        typeof scopeSpan !== 'object' ||
        (scopeSpan.spans !== undefined && !Array.isArray(scopeSpan.spans))
      ) {
        logger.warn('[TempoProvider] Skipping scope with a malformed span collection');
        continue;
      }
      yield { resourceAttributes, scopeSpan };
    }
  }
}

async function readLimitedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body + decoder.decode();
    }

    byteLength += value.byteLength;
    if (byteLength > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new TraceProviderError('Tempo trace exceeds the maximum response size');
    }

    body += decoder.decode(value, { stream: true });
  }
}

export class TempoProvider implements TraceProvider {
  readonly id = 'tempo';
  private readonly baseUrl: string;

  constructor(private readonly config: TraceProviderConfig) {
    if (!config.endpoint) {
      throw new Error('Tempo provider requires endpoint configuration');
    }

    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint);
    } catch {
      throw new Error('Tempo provider endpoint must be a valid HTTP or HTTPS URL');
    }
    const hasCredentialPath = endpoint.pathname.split('/').some((segment) => {
      try {
        return /^(?:token|key|secret|credential|auth|sk|sk-proj|sk-ant)[-_][a-z0-9._-]{8,}$/i.test(
          decodeURIComponent(segment),
        );
      } catch {
        return true;
      }
    });
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      hasCredentialPath
    ) {
      throw new Error(
        'Tempo provider endpoint must be an HTTP or HTTPS URL without credentials, query parameters, or fragments',
      );
    }
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

  private transformSpans(
    data: TempoTraceResponse,
    traceId: string,
    options?: FetchTraceOptions,
  ): SpanData[] {
    const spans: SpanData[] = [];
    const seenSpanIds = new Set<string>();
    const limit = Math.min(options?.maxSpans ?? MAX_SPANS, MAX_SPANS);
    let normalizedAttributeBytes = 0;

    for (const { resourceAttributes, scopeSpan } of getValidResourceScopes(data)) {
      for (const span of scopeSpan.spans ?? []) {
        let normalizedSpan: SpanData | null;
        try {
          normalizedSpan = transformSpan(
            span,
            traceId,
            resourceAttributes,
            scopeSpan.scope?.name,
            options,
          );
        } catch (error) {
          logger.warn(`[TempoProvider] Skipping malformed span: ${error}`);
          continue;
        }
        if (!normalizedSpan || seenSpanIds.has(normalizedSpan.spanId)) {
          continue;
        }

        normalizedAttributeBytes += Buffer.byteLength(
          JSON.stringify(normalizedSpan.attributes ?? {}),
          'utf8',
        );
        if (normalizedAttributeBytes > MAX_RESPONSE_BYTES) {
          throw new TraceProviderError('Tempo trace exceeds the maximum normalized attribute size');
        }
        seenSpanIds.add(normalizedSpan.spanId);
        spans.push(normalizedSpan);
      }
    }
    spans.sort(
      (left, right) => left.startTime - right.startTime || left.spanId.localeCompare(right.spanId),
    );
    return spans.slice(0, limit);
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
      return null;
    }
    if (!response.ok) {
      throw new TraceProviderError(`Tempo returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new TraceProviderError('Tempo trace exceeds the maximum response size');
    }
    const body = await readLimitedResponse(response);
    const data = JSON.parse(body) as TempoTraceResponse;
    if (!Array.isArray(data.batches)) {
      throw new TraceProviderError('Tempo returned an invalid trace response');
    }

    const services = new Set<string>();
    for (const batch of data.batches) {
      try {
        const service = attributesToRecord(batch.resource?.attributes)['service.name'];
        if (typeof service === 'string') {
          services.add(service);
        }
      } catch {
        // Malformed batches are skipped and logged during span conversion.
      }
    }

    return {
      traceId,
      spans: this.transformSpans(data, traceId, options),
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
      return response.ok;
    } catch {
      return false;
    }
  }
}
