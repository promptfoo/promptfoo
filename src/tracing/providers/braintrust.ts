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

interface BraintrustSpan {
  id?: string;
  span_id?: string;
  root_span_id?: string;
  span_parents?: string[];
  created?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  span_attributes?: Record<string, unknown>;
}

interface BraintrustQueryResponse {
  rows?: BraintrustSpan[];
  data?: BraintrustSpan[];
}

const MAX_SPANS = 10_000;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function transformSpan(row: BraintrustSpan, options?: FetchTraceOptions): SpanData | null {
  const spanId = row.span_id || row.id;
  const startTime = timestampMs(row.metrics?.start) ?? timestampMs(row.created);
  if (!spanId || startTime === undefined) {
    return null;
  }
  if (options?.earliestStartTime !== undefined && startTime < options.earliestStartTime) {
    return null;
  }

  const parentSpanId = row.span_parents
    ?.slice()
    .reverse()
    .find((parent) => parent && parent !== spanId);
  const name =
    typeof row.span_attributes?.name === 'string' ? row.span_attributes.name : 'braintrust.span';
  const isToolSpan = row.span_attributes?.type === 'tool';
  const attributes: Record<string, unknown> = {
    ...row.metadata,
    ...row.span_attributes,
    ...(row.metrics && { 'braintrust.metrics': row.metrics }),
    ...(row.input !== undefined && { 'braintrust.input': row.input }),
    ...(row.output !== undefined && { 'braintrust.output': row.output }),
    ...(typeof row.span_attributes?.type === 'string' && {
      'braintrust.span.type': row.span_attributes.type,
    }),
    ...(isToolSpan && getNormalizedToolAttributes(name, row.input)),
  };

  return {
    spanId,
    ...(parentSpanId && { parentSpanId }),
    name,
    startTime,
    ...(timestampMs(row.metrics?.end) !== undefined && {
      endTime: timestampMs(row.metrics?.end),
    }),
    attributes,
    statusCode: row.error ? 2 : 1,
    ...(row.error ? { statusMessage: String(row.error) } : {}),
  };
}

/** Retrieve Braintrust project traces correlated with an OpenTelemetry trace ID. */
export class BraintrustProvider implements TraceProvider {
  readonly id = 'braintrust';
  private readonly baseUrl: string;
  private readonly projectId: string;
  private readonly token: string;

  constructor(private readonly config: TraceProviderConfig) {
    if (!config.endpoint) {
      throw new Error('Braintrust provider requires endpoint configuration');
    }
    if (!config.projectId || !PROJECT_ID_PATTERN.test(config.projectId)) {
      throw new Error('Braintrust provider requires a valid projectId');
    }
    if (!config.auth?.token) {
      throw new Error('Braintrust provider requires an auth token');
    }

    validateTraceProviderEndpoint(config.endpoint, 'Braintrust');
    if (
      config.timeout !== undefined &&
      (!Number.isSafeInteger(config.timeout) || config.timeout <= 0)
    ) {
      throw new Error('Braintrust provider timeout must be a positive integer');
    }

    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.projectId = config.projectId;
    this.token = config.auth.token;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.config.headers };
    for (const header of Object.keys(headers)) {
      if (['accept', 'authorization', 'content-type'].includes(header.toLowerCase())) {
        delete headers[header];
      }
    }

    return {
      ...headers,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async fetchTrace(traceId: string, options?: FetchTraceOptions): Promise<FetchTraceResult | null> {
    if (!TRACE_ID_PATTERN.test(traceId) || /^0+$/.test(traceId)) {
      throw new TraceProviderError('Trace ID must contain 32 hexadecimal characters');
    }

    const normalizedTraceId = traceId.toLowerCase();
    const maxSpans = Math.min(options?.maxSpans ?? MAX_SPANS, MAX_SPANS);
    // Braintrust native root_span_id values do not necessarily match W3C trace IDs.
    // Customers should log the propagated ID as metadata.trace_id or metadata.promptfoo_trace_id.
    // The traces shape returns every span in a matching trace, including child spans that do
    // not repeat the correlation metadata.
    const query = [
      'SELECT id, span_id, root_span_id, span_parents, created, input, output,',
      '  error, metadata, metrics, span_attributes',
      `FROM project_logs('${this.projectId}', shape => 'traces')`,
      'WHERE created >= now() - INTERVAL 1 DAY',
      `  AND (metadata.trace_id = '${normalizedTraceId}'`,
      `    OR metadata.promptfoo_trace_id = '${normalizedTraceId}'`,
      `    OR metadata."promptfoo.trace_id" = '${normalizedTraceId}'`,
      `    OR root_span_id = '${normalizedTraceId}')`,
      `LIMIT ${maxSpans}`,
    ].join('\n');

    const timeoutSignal = AbortSignal.timeout(this.config.timeout ?? 10_000);
    const signal = options?.abortSignal
      ? AbortSignal.any([timeoutSignal, options.abortSignal])
      : timeoutSignal;
    const response = await fetchWithProxy(`${this.baseUrl}/btql`, {
      disableTransientRetries: true,
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ query, fmt: 'json' }),
      redirect: 'error',
      signal,
    });

    if (response.status === 404) {
      await releaseResponse(response, 'Braintrust');
      throw new TraceProviderError(
        'Braintrust BTQL endpoint returned HTTP 404; check the endpoint and project configuration',
        { statusCode: response.status },
      );
    }
    if (!response.ok) {
      await releaseResponse(response, 'Braintrust');
      throw new TraceProviderError(`Braintrust returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }

    if (Number(response.headers.get('content-length')) > MAX_TRACE_RESPONSE_BYTES) {
      await releaseResponse(response, 'Braintrust');
      throw new TraceProviderError('Braintrust trace exceeds the maximum response size');
    }
    const body = await readLimitedResponse(response, 'Braintrust');

    const result = JSON.parse(body) as BraintrustQueryResponse;
    const rows = result.rows ?? result.data;
    if (!Array.isArray(rows)) {
      throw new TraceProviderError('Braintrust returned an invalid query response');
    }
    if (rows.length === 0) {
      return null;
    }

    const spans: SpanData[] = [];
    const services = new Set<string>();
    for (const row of rows) {
      if (spans.length >= maxSpans) {
        break;
      }
      const span = transformSpan(row, options);
      if (!span) {
        logger.warn('[BraintrustProvider] Skipping malformed span');
        continue;
      }
      const service = span.attributes?.['service.name'];
      if (typeof service === 'string') {
        services.add(service);
      }
      spans.push(span);
    }

    return spans.length > 0
      ? { traceId: normalizedTraceId, spans, services: [...services], fetchedAt: Date.now() }
      : null;
  }
}
