import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { LangfuseProvider } from '../../../src/tracing/providers/langfuse';
import { TraceProviderError } from '../../../src/tracing/providers/types';
import { isRelevantSpan } from '../../../src/tracing/spanFilter';
import { getToolNameFromAttributes } from '../../../src/tracing/toolAttributes';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedFetch = vi.mocked(fetchWithProxy);
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const config = {
  id: 'langfuse' as const,
  endpoint: 'https://cloud.langfuse.com',
  auth: { username: 'pk-public', password: 'sk-secret' },
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

const observations = [
  {
    id: 'root-span',
    traceId: TRACE_ID,
    parentObservationId: null,
    name: 'customer.request',
    type: 'SPAN',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T00:00:01.000Z',
    level: 'DEFAULT',
    metadata: { 'service.name': 'customer-agent', tenant: 'team-west' },
    input: '{"prompt":"hello"}',
    output: '{"text":"world"}',
  },
  {
    id: 'generation-span',
    traceId: TRACE_ID,
    parentObservationId: 'root-span',
    name: 'chat gpt-4o',
    type: 'GENERATION',
    startTime: '2024-01-01T00:00:00.100Z',
    endTime: '2024-01-01T00:00:00.500Z',
    level: 'ERROR',
    statusMessage: 'model unavailable',
    providedModelName: 'gpt-4o',
    modelParameters: { temperature: 0.2 },
    usageDetails: { input: 98, output: 68, total: 166 },
    inputUsage: 98,
    outputUsage: 68,
    totalUsage: 166,
    inputCost: 0.00049,
    outputCost: 0.00204,
    totalCost: 0.00253,
  },
];

describe('LangfuseProvider', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockImplementation(async () => response({ data: observations, meta: {} }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    { id: 'langfuse' },
    { ...config, endpoint: 'not-a-url' },
    { ...config, endpoint: 'file:///tmp/traces' },
    { ...config, endpoint: 'https://user:secret@langfuse.example.com' },
    { ...config, endpoint: 'https://langfuse.example.com?token=secret' },
    { ...config, endpoint: 'https://langfuse.example.com#secret' },
    { ...config, endpoint: 'https://langfuse.example.com/token-privateTenantCredential123' },
    { ...config, auth: {} },
    { ...config, auth: { username: 'public-key' } },
    { ...config, auth: { password: 'secret-key' } },
    { ...config, auth: { ...config.auth, token: 'bearer-token' } },
    { ...config, timeout: -1 },
  ] as const)('rejects unsafe or incomplete configuration: %o', (value) => {
    expect(() => new LangfuseProvider(value)).toThrow();
  });

  it.each(['../../admin', 'abc123', '00000000000000000000000000000000'])(
    'rejects invalid OpenTelemetry trace IDs: %s',
    async (traceId) => {
      await expect(new LangfuseProvider(config).fetchTrace(traceId)).rejects.toThrow(
        TraceProviderError,
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('retrieves observations, parentage, model metadata, token usage, and costs', async () => {
    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

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
        tenant: 'team-west',
        'langfuse.observation.type': 'SPAN',
        'langfuse.input': { prompt: 'hello' },
        'langfuse.output': { text: 'world' },
      },
    });
    expect(result?.spans[1]).toMatchObject({
      parentSpanId: 'root-span',
      name: 'chat gpt-4o',
      statusCode: 2,
      statusMessage: 'model unavailable',
      attributes: {
        'langfuse.observation.type': 'GENERATION',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': 'gpt-4o',
        'gen_ai.request.temperature': 0.2,
        'langfuse.model.parameters': { temperature: 0.2 },
        'langfuse.usage': { input: 98, output: 68, total: 166 },
        'gen_ai.usage.input_tokens': 98,
        'gen_ai.usage.output_tokens': 68,
        'langfuse.usage.total_tokens': 166,
        'promptfoo.usage.total_tokens': 166,
        'langfuse.cost.input': 0.00049,
        'langfuse.cost.output': 0.00204,
        'langfuse.cost.total': 0.00253,
      },
    });

    const [url, options] = mockedFetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/api/public/v2/observations');
    expect(new URL(String(url)).searchParams.get('traceId')).toBe(TRACE_ID);
    expect(new URL(String(url)).searchParams.get('fields')).toBe(
      'core,basic,io,metadata,model,usage',
    );
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from('pk-public:sk-secret').toString('base64')}`,
      },
    });
  });

  it('preserves reverse-proxy paths and prevents custom headers from overriding authentication', async () => {
    await new LangfuseProvider({
      ...config,
      endpoint: 'https://langfuse.example.com/team-west/',
      headers: { authorization: 'Bearer unexpected', ACCEPT: 'text/plain', 'X-Tenant': 'west' },
    }).fetchTrace(TRACE_ID);

    const [url, options] = mockedFetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/team-west/api/public/v2/observations');
    expect(options?.headers).toEqual({
      'X-Tenant': 'west',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from('pk-public:sk-secret').toString('base64')}`,
    });
  });

  it('normalizes Langfuse tool observations for trajectory assertions', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            id: 'tool-span',
            traceId: TRACE_ID,
            name: 'search',
            type: 'TOOL',
            startTime: '2024-01-01T00:00:00.000Z',
            input: '{"query":"customer orders"}',
            output: '{"count":3}',
          },
        ],
      }),
    );

    const span = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({
      'langfuse.observation.type': 'TOOL',
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'search',
      'gen_ai.tool.call.arguments': { query: 'customer orders' },
      'gen_ai.tool.call.result': { count: 3 },
      'tool.name': 'search',
      'tool.arguments': '{"query":"customer orders"}',
    });
    expect(getToolNameFromAttributes(span?.attributes)).toBe('search');
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it.each([
    { type: 'GENERATION', operation: 'chat' },
    { type: 'EMBEDDING', operation: 'embeddings' },
    { type: 'TOOL', operation: 'execute_tool' },
    { type: 'AGENT', operation: 'invoke_agent' },
    { type: 'CHAIN', operation: 'invoke_workflow' },
    { type: 'RETRIEVER', operation: 'retrieval' },
  ])('maps $type observations to standard GenAI operations', async ({ type, operation }) => {
    mockedFetch.mockResolvedValue(
      response({
        data: [{ ...observations[0], id: `${type}-span`, name: `${type} action`, type }],
      }),
    );

    const span = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({
      'langfuse.observation.type': type,
      'gen_ai.operation.name': operation,
    });
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it.each([
    { name: 'text_completion gpt-4o', operation: 'text_completion' },
    { name: 'text-completion gpt-4o', operation: 'text_completion' },
    { name: 'generate_content gemini', operation: 'generate_content' },
  ])(
    'infers the more specific GenAI generation operation from $name',
    async ({ name, operation }) => {
      mockedFetch.mockResolvedValue(response({ data: [{ ...observations[1], name }] }));

      expect(
        (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0].attributes,
      ).toEqual(expect.objectContaining({ 'gen_ai.operation.name': operation }));
    },
  );

  it.each([
    { type: 'AGENT', attribute: 'gen_ai.agent.name' },
    { type: 'CHAIN', attribute: 'gen_ai.workflow.name' },
    { type: 'EVALUATOR', attribute: 'gen_ai.evaluation.name' },
    { type: 'GUARDRAIL', attribute: 'guardrail.name' },
  ])('normalizes the name of $type observations', async ({ type, attribute }) => {
    mockedFetch.mockResolvedValue(
      response({
        data: [{ ...observations[0], id: `${type}-span`, name: 'customer-action', type }],
      }),
    );

    const span = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({ [attribute]: 'customer-action' });
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it('keeps incomplete model generations relevant without model or usage fields', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            id: 'incomplete-generation',
            traceId: TRACE_ID,
            name: 'customer-model',
            type: 'GENERATION',
            startTime: '2024-01-01T00:00:00.000Z',
            input: '{"prompt":"hello"}',
            output: '{"text":"world"}',
          },
        ],
      }),
    );

    const span = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'langfuse.input': { prompt: 'hello' },
      'langfuse.output': { text: 'world' },
    });
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it('restores original OpenTelemetry span and resource attributes from Langfuse metadata', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            ...observations[1],
            metadata: {
              tenant: 'team-west',
              attributes: {
                'gen_ai.operation.name': 'generate_content',
                'gen_ai.provider.name': 'gcp.gemini',
                'gen_ai.request.model': 'original-model',
                'gen_ai.request.temperature': 0.7,
                'http.request.method': 'POST',
              },
              resourceAttributes: {
                'service.name': 'customer-agent',
                'deployment.environment.name': 'production',
              },
            },
          },
        ],
      }),
    );

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result?.services).toEqual(['customer-agent']);
    expect(result?.spans[0].attributes).toMatchObject({
      tenant: 'team-west',
      'service.name': 'customer-agent',
      'deployment.environment.name': 'production',
      'gen_ai.operation.name': 'generate_content',
      'gen_ai.provider.name': 'gcp.gemini',
      'gen_ai.request.model': 'original-model',
      'gen_ai.request.temperature': 0.7,
      'http.request.method': 'POST',
    });
  });

  it('normalizes model settings and detailed token usage when summary fields are missing', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            ...observations[1],
            inputUsage: undefined,
            outputUsage: undefined,
            totalUsage: undefined,
            modelParameters: {
              temperature: 0.6,
              maxTokens: 512,
              top_p: 0.9,
              presencePenalty: 0.1,
              ignored: 42,
            },
            usageDetails: {
              input: 120,
              output: 30,
              total: 150,
              reasoning_tokens: 12,
              cache_read_input_tokens: 40,
              cache_creation_input_tokens: 10,
            },
          },
        ],
      }),
    );

    expect((await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0].attributes).toEqual(
      expect.objectContaining({
        'gen_ai.request.temperature': 0.6,
        'gen_ai.request.max_tokens': 512,
        'gen_ai.request.top_p': 0.9,
        'gen_ai.request.presence_penalty': 0.1,
        'gen_ai.usage.input_tokens': 120,
        'gen_ai.usage.output_tokens': 30,
        'gen_ai.usage.reasoning.output_tokens': 12,
        'gen_ai.usage.cache_read.input_tokens': 40,
        'gen_ai.usage.cache_creation.input_tokens': 10,
        'promptfoo.usage.total_tokens': 150,
      }),
    );
  });

  it('omits reserved keys from untrusted observation metadata', async () => {
    const metadata = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"unsafe","prototype":"unsafe","tenant":"west"}',
    );
    mockedFetch.mockResolvedValue(response({ data: [{ ...observations[0], metadata }] }));

    const attributes = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0]
      .attributes;

    expect(attributes).toMatchObject({ tenant: 'west' });
    expect(Object.hasOwn(attributes!, '__proto__')).toBe(false);
    expect(Object.hasOwn(attributes!, 'constructor')).toBe(false);
    expect(Object.hasOwn(attributes!, 'prototype')).toBe(false);
  });

  it('omits reserved path segments from preserved OpenTelemetry and resource attributes', async () => {
    const metadata = JSON.parse(
      '{"attributes":{"__proto__":{"polluted":true},"gen_ai.constructor.polluted":true,"gen_ai.operation.name":"text_completion"},"resourceAttributes":{"prototype":"unsafe","service.name":"safe-service"}}',
    );
    mockedFetch.mockResolvedValue(response({ data: [{ ...observations[1], metadata }] }));

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);
    const attributes = result?.spans[0].attributes;

    expect(attributes).toMatchObject({
      'gen_ai.operation.name': 'text_completion',
      'service.name': 'safe-service',
    });
    expect(Object.hasOwn(attributes!, '__proto__')).toBe(false);
    expect(Object.hasOwn(attributes!, 'gen_ai.constructor.polluted')).toBe(false);
    expect(Object.hasOwn(attributes!, 'prototype')).toBe(false);
    expect(result?.services).toEqual(['safe-service']);
  });

  it('normalizes current Langfuse observation cost details', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            ...observations[1],
            costDetails: { input: 0.001, output: 0.002, total: 0.003 },
          },
        ],
      }),
    );

    expect((await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0].attributes).toEqual(
      expect.objectContaining({
        'langfuse.cost.input': 0.001,
        'langfuse.cost.output': 0.002,
        'langfuse.cost.total': 0.003,
      }),
    );
  });

  it('follows Langfuse page-based pagination and deduplicates observations', async () => {
    mockedFetch
      .mockResolvedValueOnce(
        response({ data: [observations[0]], meta: { page: 1, totalPages: 2 } }),
      )
      .mockResolvedValueOnce(response({ data: observations, meta: { page: 2, totalPages: 2 } }));

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result?.spans).toHaveLength(2);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('page')).toBe('2');
  });

  it('keeps a stable page size while fetching a partial final page', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      ...observations[0],
      id: `span-${index}`,
    }));
    mockedFetch
      .mockResolvedValueOnce(response({ data: firstPage, meta: { page: 1, totalPages: 2 } }))
      .mockResolvedValueOnce(
        response({
          data: [{ ...observations[0], id: 'span-1000' }],
          meta: { page: 2, totalPages: 2 },
        }),
      );

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 1_001 });

    expect(result?.spans).toHaveLength(1_001);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1000');
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('limit')).toBe('1000');
  });

  it('follows pagination cursors and deduplicates observations across pages', async () => {
    mockedFetch
      .mockResolvedValueOnce(response({ data: [observations[0]], meta: { cursor: 'next-page' } }))
      .mockResolvedValueOnce(response({ data: observations, meta: {} }));

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result?.spans).toHaveLength(2);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('cursor')).toBe(
      'next-page',
    );
  });

  it('rejects repeated pagination cursors', async () => {
    mockedFetch.mockImplementation(async () =>
      response({ data: [observations[0]], meta: { cursor: 'again' } }),
    );

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'repeated pagination cursor',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when Langfuse has not indexed the requested trace', async () => {
    mockedFetch.mockResolvedValue(response({ data: [], meta: {} }));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it('accepts zero-page pagination metadata for an empty trace lookup', async () => {
    mockedFetch.mockResolvedValue(response({ data: [], meta: { page: 1, totalPages: 0 } }));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it('returns null when Langfuse does not recognize the requested endpoint', async () => {
    mockedFetch.mockResolvedValue(response({ error: 'not found' }, 404));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it.each([408, 429, 500, 503])('marks HTTP %s failures as retryable', async (status) => {
    mockedFetch.mockResolvedValue(response({ error: 'busy' }, status));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: status,
      retryable: true,
    });
  });

  it('does not retry invalid credentials', async () => {
    mockedFetch.mockResolvedValue(response({ error: 'unauthorized' }, 401));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 401,
      retryable: false,
    });
  });

  it('filters spans by start time and passes the time filter to Langfuse', async () => {
    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID, {
      earliestStartTime: 1704067200050,
    });

    expect(result?.spans.map((span) => span.name)).toEqual(['chat gpt-4o']);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('fromStartTime')).toBe(
      '2024-01-01T00:00:00.050Z',
    );
  });

  it('caps the returned span count and avoids unnecessary pagination', async () => {
    mockedFetch.mockResolvedValue(response({ data: observations, meta: { cursor: 'next-page' } }));

    expect(
      (await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 1 }))?.spans,
    ).toHaveLength(1);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1');
  });

  it('never sends a non-positive page limit', async () => {
    await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 0 });

    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1');
  });

  it('skips malformed, unrelated, and temporally invalid observations', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          null,
          { ...observations[0], id: '' },
          { ...observations[0], traceId: 'fedcba9876543210fedcba9876543210' },
          { ...observations[0], startTime: 'not-a-date' },
          { ...observations[0], endTime: '2023-12-31T23:59:59.000Z' },
          { ...observations[0], parentObservationId: observations[0].id },
          observations[1],
        ],
      }),
    );

    expect((await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans).toEqual([
      expect.objectContaining({ spanId: 'generation-span' }),
    ]);
  });

  it.each([
    { result: 'not observations' },
    { data: observations, meta: { cursor: 123 } },
    { data: observations, meta: { page: 0, totalPages: 2 } },
    { data: observations, meta: { page: 2, totalPages: 1 } },
  ])('rejects malformed Langfuse response payloads: %o', async (payload) => {
    mockedFetch.mockResolvedValue(response(payload));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      TraceProviderError,
    );
  });

  it('rejects responses larger than the configured safety bound', async () => {
    mockedFetch.mockResolvedValue(
      new Response('{}', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }),
    );

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
  });

  it('applies the response size limit across paginated observation requests', async () => {
    const firstPage = response({
      data: [observations[0]],
      meta: { page: 1, totalPages: 2 },
    });
    const secondPage = new Response('{}', {
      headers: { 'content-length': String(10 * 1024 * 1024) },
    });
    const cancel = vi.spyOn(secondPage.body!, 'cancel');
    mockedFetch.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels oversized streamed responses before buffering their contents', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    mockedFetch.mockResolvedValue(new Response(body, { headers: { 'content-length': '1' } }));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('forwards evaluation cancellation to the external request', async () => {
    const controller = new AbortController();

    await new LangfuseProvider(config).fetchTrace(TRACE_ID, { abortSignal: controller.signal });

    const requestSignal = mockedFetch.mock.calls[0][1]?.signal;
    expect(requestSignal?.aborted).toBe(false);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });
});
