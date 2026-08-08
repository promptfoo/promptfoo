import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { BraintrustProvider } from '../../../src/tracing/providers/braintrust';
import { TraceProviderError } from '../../../src/tracing/providers/types';
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
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = JSON.parse(options?.body as string);
    expect(body.query).toContain(`project_logs('${PROJECT_ID}', shape => 'traces')`);
    expect(body.query).toContain(`metadata.trace_id = '${TRACE_ID}'`);
    expect(body.query).toContain('created >= now() - INTERVAL 1 DAY');
  });

  it('accepts documented data-shaped BTQL responses', async () => {
    mockedFetch.mockResolvedValue(response({ data: [rows[0]] }));

    expect((await new BraintrustProvider(config).fetchTrace(TRACE_ID))?.spans).toHaveLength(1);
  });

  it('returns null when Braintrust has not indexed the requested trace', async () => {
    mockedFetch.mockResolvedValue(response({ rows: [] }));

    expect(await new BraintrustProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it('marks rate-limit and server failures as retryable', async () => {
    mockedFetch.mockResolvedValue(response({ error: 'busy' }, 429));

    await expect(new BraintrustProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 429,
      retryable: true,
    });
  });

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
