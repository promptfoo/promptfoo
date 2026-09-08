import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { OpenClawChatProvider } from '../../src/providers/openclaw/chat';
import { OpenClawResponsesProvider } from '../../src/providers/openclaw/responses';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

describe('OpenClaw provider tracing', () => {
  let tracerProvider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    tracerProvider.register();
  });

  beforeEach(() => {
    exporter.reset();
    vi.mocked(fetchWithCache).mockReset();
  });

  afterEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });

  afterAll(async () => {
    try {
      await tracerProvider.shutdown();
    } finally {
      trace.disable();
      context.disable();
      propagation.disable();
    }
  });

  it.each([
    { agentId: undefined, providerId: 'openclaw', model: 'openclaw/default' },
    { agentId: 'main', providerId: 'openclaw:main', model: 'openclaw/main' },
    {
      agentId: 'coding-agent',
      providerId: 'openclaw:coding-agent',
      model: 'openclaw/coding-agent',
    },
    {
      agentId: undefined,
      id: 'customer-gateway',
      providerId: 'customer-gateway',
      model: 'openclaw/default',
    },
  ])(
    'attributes $providerId Chat calls to OpenClaw',
    async ({ agentId, providerId, model, ...options }) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [
            { message: { role: 'assistant', content: 'OpenClaw reply' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      const provider = new OpenClawChatProvider(agentId, {
        ...options,
        config: { gateway_url: 'http://127.0.0.1:18789', auth_token: 'test-openclaw-token' },
      });

      const result = await provider.callApi('Trace this prompt');
      await tracerProvider.forceFlush();

      expect(provider.id()).toBe(providerId);
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('OpenClaw reply');
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('http://127.0.0.1:18789/v1/chat/completions');
      expect(JSON.parse(request?.body as string).model).toBe(model);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe(`chat ${model}`);
      expect(spans[0].attributes).toMatchObject({
        'gen_ai.provider.name': 'openclaw',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'promptfoo.provider.id': providerId,
      });
      expect(spans[0].attributes).not.toHaveProperty('openai.api.type');
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    },
  );

  it('preserves OpenClaw attribution for the bare Responses provider', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'OpenClaw reply' }],
          },
        ],
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    const provider = new OpenClawResponsesProvider(undefined, {
      config: { gateway_url: 'http://127.0.0.1:18789', auth_token: 'test-openclaw-token' },
    });

    const result = await provider.callApi('Trace this prompt');
    await tracerProvider.forceFlush();

    expect(provider.id()).toBe('openclaw:responses');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('OpenClaw reply');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:18789/v1/responses');
    expect(JSON.parse(request?.body as string).model).toBe('openclaw/default');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes).toMatchObject({
      'gen_ai.provider.name': 'openclaw',
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'openclaw/default',
      'promptfoo.provider.id': 'openclaw:responses',
    });
    expect(spans[0].attributes).not.toHaveProperty('openai.api.type');
    expect(spans[0].status.code).toBe(SpanStatusCode.OK);
  });
});
