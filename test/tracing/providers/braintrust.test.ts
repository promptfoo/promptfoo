import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { BraintrustProvider } from '../../../src/tracing/providers/braintrust';
import { TraceProviderError } from '../../../src/tracing/providers/types';
import { isRelevantSpan } from '../../../src/tracing/spanFilter';
import { getToolNameFromAttributes } from '../../../src/tracing/toolAttributes';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedFetch = vi.mocked(fetchWithProxy);
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const PROJECT_ID = '12345678-1234-4123-8123-123456789abc';
const config = {
  id: 'braintrust' as const,
  endpoint: 'https://api.braintrust.dev',
  projectId: PROJECT_ID,
  auth: { token: 'test-token' },
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

const rows = [
  {
    id: 'root-event',
    span_id: 'root-span',
    root_span_id: 'root-span',
    created: '2024-01-01T00:00:00.000Z',
    metadata: { 'service.name': 'customer-agent', trace_id: TRACE_ID },
    metrics: { start: 1704067200, end: 1704067201, tokens: 42 },
    span_attributes: { name: 'customer.request', type: 'task' },
    input: { prompt: 'hello' },
    output: { text: 'world' },
  },
  {
    id: 'child-event',
    span_id: 'child-span',
    root_span_id: 'root-span',
    span_parents: ['root-span'],
    created: '2024-01-01T00:00:00.100Z',
    metrics: { start: 1704067200.1, end: 1704067200.5 },
    span_attributes: { name: 'tool.search', type: 'tool' },
    error: 'tool unavailable',
  },
];

describe('BraintrustProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFetch.mockImplementation(async () => response({ rows }));
  });

  it.each([
    { id: 'braintrust' },
    { ...config, endpoint: 'file:///tmp/traces' },
    { ...config, endpoint: 'https://user:secret@braintrust.example.com' },
    { ...config, endpoint: 'https://api.braintrust.dev?tenant=west' },
    { ...config, endpoint: 'https://api.braintrust.dev#tenant-west' },
    { ...config, endpoint: 'https://api.braintrust.dev/token-privateTenantCredential123' },
    { ...config, projectId: 'invalid-project' },
    { ...config, auth: {} },
    { ...config, timeout: -1 },
  ] as const)('rejects unsafe or incomplete configuration: %o', (value) => {
    expect(() => new BraintrustProvider(value)).toThrow();
  });

  it.each(['../../admin', 'abc123', '00000000000000000000000000000000'])(
    'rejects invalid OpenTelemetry trace IDs: %s',
    async (traceId) => {
      await expect(new BraintrustProvider(config).fetchTrace(traceId)).rejects.toThrow(
        TraceProviderError,
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('queries full Braintrust traces using the propagated OpenTelemetry trace ID', async () => {
    const result = await new BraintrustProvider(config).fetchTrace(TRACE_ID);

    expect(result).toMatchObject({ traceId: TRACE_ID, services: ['customer-agent'] });
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]).toMatchObject({
      spanId: 'root-span',
      name: 'customer.request',
      startTime: 1704067200000,
      endTime: 1704067201000,
      statusCode: 1,
      attributes: {
        'service.name': 'customer-agent',
        'braintrust.span.type': 'task',
        'braintrust.metrics': { start: 1704067200, end: 1704067201, tokens: 42 },
        'braintrust.input': { prompt: 'hello' },
        'braintrust.output': { text: 'world' },
      },
    });
    expect(result?.spans[1]).toMatchObject({
      parentSpanId: 'root-span',
      name: 'tool.search',
      statusCode: 2,
      statusMessage: 'tool unavailable',
    });

    const [url, options] = mockedFetch.mock.calls[0];
    expect(url).toBe('https://api.braintrust.dev/btql');
    expect(options).toMatchObject({
      disableTransientRetries: true,
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      redirect: 'error',
    });
    const body = JSON.parse(options?.body as string);
    expect(body.query).toContain(`project_logs('${PROJECT_ID}', shape => 'traces')`);
    expect(body.query).toContain(`metadata.trace_id = '${TRACE_ID}'`);
    expect(body.query).toContain('created >= now() - INTERVAL 1 DAY');
  });

  it('links deeply nested spans to their immediate parent', async () => {
    mockedFetch.mockResolvedValue(
      response({
        rows: [
          ...rows,
          {
            id: 'grandchild-event',
            span_id: 'grandchild-span',
            span_parents: ['root-span', 'child-span', 'grandchild-span'],
            created: '2024-01-01T00:00:00.200Z',
            span_attributes: { name: 'tool.follow_up', type: 'tool' },
          },
        ],
      }),
    );

    const result = await new BraintrustProvider(config).fetchTrace(TRACE_ID);

    expect(result?.spans[2]).toMatchObject({
      spanId: 'grandchild-span',
      parentSpanId: 'child-span',
    });
  });

  it('normalizes successful Braintrust tool spans for trajectory assertions', async () => {
    mockedFetch.mockResolvedValue(
      response({
        rows: [
          {
            id: 'search-event',
            span_id: 'search-span',
            created: '2024-01-01T00:00:00.000Z',
            input: { query: 'customer orders' },
            span_attributes: { name: 'search', type: 'tool' },
          },
        ],
      }),
    );

    const span = (await new BraintrustProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({
      'braintrust.input': { query: 'customer orders' },
      'gen_ai.tool.name': 'search',
      'tool.name': 'search',
      'tool.arguments': '{"query":"customer orders"}',
    });
    expect(getToolNameFromAttributes(span?.attributes)).toBe('search');
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it('protects provider-controlled headers regardless of their casing', async () => {
    await new BraintrustProvider({
      ...config,
      headers: {
        authorization: 'Bearer unexpected',
        aCcEpT: 'text/plain',
        'content-TYPE': 'text/plain',
        'X-Tenant': 'tenant-a',
      },
    }).fetchTrace(TRACE_ID);

    const [, options] = mockedFetch.mock.calls[0];
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
      'X-Tenant': 'tenant-a',
    });
  });

  it('accepts documented data-shaped BTQL responses', async () => {
    mockedFetch.mockResolvedValue(response({ data: [rows[0]] }));

    expect((await new BraintrustProvider(config).fetchTrace(TRACE_ID))?.spans).toHaveLength(1);
  });

  it('returns null when Braintrust has not indexed the requested trace', async () => {
    mockedFetch.mockResolvedValue(response({ rows: [] }));

    expect(await new BraintrustProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it.each([408, 429, 500, 503])('marks HTTP %i as retryable', async (status) => {
    mockedFetch.mockResolvedValue(response({ error: 'busy' }, status));

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: status,
      retryable: true,
    });
  });

  it('treats a missing BTQL endpoint as an actionable configuration error', async () => {
    const missingEndpointResponse = response({ error: 'not found' }, 404);
    const cancel = vi.spyOn(missingEndpointResponse.body!, 'cancel');
    mockedFetch.mockResolvedValue(missingEndpointResponse);

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      message: expect.stringContaining('check the endpoint and project configuration'),
      statusCode: 404,
      retryable: false,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('releases unsuccessful response bodies before propagating provider errors', async () => {
    const unauthorizedResponse = response({ error: 'unauthorized' }, 401);
    const cancel = vi.spyOn(unauthorizedResponse.body!, 'cancel');
    mockedFetch.mockResolvedValue(unauthorizedResponse);

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 401,
      retryable: false,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('releases responses whose declared size exceeds the limit', async () => {
    const oversizedResponse = new Response('{}', {
      headers: { 'content-length': '10485761' },
    });
    const cancel = vi.spyOn(oversizedResponse.body!, 'cancel');
    mockedFetch.mockResolvedValue(oversizedResponse);

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, '1'])(
    'cancels oversized streamed responses when content-length is %s',
    async (contentLength) => {
      const cancel = vi.fn();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
        },
        cancel,
      });
      mockedFetch.mockResolvedValue(
        new Response(body, {
          ...(contentLength && { headers: { 'content-length': contentLength } }),
        }),
      );

      await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
        'maximum response size',
      );
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('filters spans by start time and caps the result count', async () => {
    const provider = new BraintrustProvider(config);

    expect((await provider.fetchTrace(TRACE_ID, { maxSpans: 1 }))?.spans).toHaveLength(1);
    expect(
      (await provider.fetchTrace(TRACE_ID, { earliestStartTime: 1704067200050 }))?.spans.map(
        (span) => span.name,
      ),
    ).toEqual(['tool.search']);
  });

  it('rejects malformed BTQL response payloads', async () => {
    mockedFetch.mockResolvedValue(response({ result: 'not span rows' }));

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'invalid query response',
    );
  });
});
