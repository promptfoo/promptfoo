import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import { VercelAiProvider } from '../../src/providers/vercel';
import type { FinishReason, ProviderMetadata } from 'ai';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

// Keep the AI SDK and Gateway implementation real; only HTTP and cache storage are replaced.
const fetchMock = vi.fn<typeof fetch>();
const cache = { get: vi.fn(), set: vi.fn() };
const usage = {
  inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};
const tokenUsage = { prompt: 7, completion: 3, total: 10, numRequests: 1 };
const config = {
  apiKey: 'fixture-key',
  baseUrl: 'https://gateway.example.test/v1/ai',
  maxRetries: 0,
};

function gatewayResponse(
  text: string,
  finishReason: FinishReason,
  streaming = false,
  rawFinishReason?: string,
  providerMetadata?: ProviderMetadata,
) {
  const reason = { unified: finishReason, raw: rawFinishReason };
  if (!streaming) {
    return Response.json({
      content: text ? [{ type: 'text', text }] : [],
      finishReason: reason,
      usage,
      providerMetadata,
      warnings: [],
    });
  }
  const parts = [
    { type: 'stream-start', warnings: [] },
    ...(text
      ? [
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: text },
          { type: 'text-end', id: 'text' },
        ]
      : []),
    { type: 'finish', finishReason: reason, usage, providerMetadata },
  ];
  return new Response(parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  cache.get.mockReset().mockResolvedValue(undefined);
  cache.set.mockReset().mockResolvedValue(undefined);
  vi.mocked(getCache).mockResolvedValue(cache as any);
  vi.mocked(isCacheEnabled).mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Vercel AI SDK response handling', () => {
  it.each([false, true])('reads the billed gateway cost with streaming=%s', async (streaming) => {
    const provider = new VercelAiProvider('openai/gpt-6.2-sol', {
      config: { ...config, streaming },
    });
    for (const [cost, expected] of [
      [0.003, 0.003],
      ['0.0000123', 0.0000123],
      ['0', 0],
      [0, 0],
      [-1, undefined],
      ['', undefined],
      ['1.2 USD', undefined],
      ['1e999', undefined],
      [null, undefined],
    ] as const) {
      fetchMock.mockResolvedValueOnce(
        gatewayResponse('Hello', 'stop', streaming, undefined, {
          gateway: { cost, marketCost: 1 },
        }),
      );
      const result = await provider.callApi('Hello');
      expect(result.output).toBe('Hello');
      expect(result.cost).toBe(expected);
    }
  });

  it('accepts JSON response tools normalized to stop by the Anthropic adapter', async () => {
    fetchMock.mockResolvedValueOnce(
      gatewayResponse('{"answer":"Hello"}', 'stop', false, 'tool_use'),
    );
    const provider = new VercelAiProvider('anthropic/fixture', {
      config: { ...config, responseSchema: { type: 'object' } },
    });

    expect(await provider.callApi('Hello')).toEqual({
      output: { answer: 'Hello' },
      finishReason: 'stop',
      tokenUsage,
    });
  });

  it('does not treat text from a tool-calling step as final structured output', async () => {
    fetchMock.mockResolvedValueOnce(
      gatewayResponse('{"answer":"Hello"}', 'tool-calls', false, 'tool_use'),
    );
    const provider = new VercelAiProvider('fixture/model', {
      config: { ...config, responseSchema: { type: 'object' } },
    });

    expect(await provider.callApi('Hello')).toEqual({
      error: 'API call error: No output generated.',
      finishReason: 'tool_calls',
      tokenUsage,
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('generates structured output through the SDK and keeps it ahead of streaming', async () => {
    fetchMock.mockResolvedValueOnce(gatewayResponse('{"answer":"Hello"}', 'stop'));
    const responseSchema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    };
    const provider = new VercelAiProvider('fixture/model', {
      config: { ...config, responseSchema, streaming: true, maxTokens: 48 },
    });

    const result = await provider.callApi('Hello');

    expect(result).toEqual({ output: { answer: 'Hello' }, finishReason: 'stop', tokenUsage });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${config.baseUrl}/language-model`);
    expect(new Headers(request?.headers).get('ai-language-model-streaming')).toBe('false');
    expect(JSON.parse(request?.body as string)).toMatchObject({
      maxOutputTokens: 48,
      responseFormat: {
        type: 'json',
        schema: { ...responseSchema, additionalProperties: false },
      },
    });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), JSON.stringify(result));
  });

  it.each(['text', 'streaming', 'structured'])(
    'preserves finish reasons and usage for %s content filtering',
    async (mode) => {
      for (const text of ['', 'I cannot comply.']) {
        fetchMock.mockResolvedValueOnce(
          gatewayResponse(text, 'content-filter', mode === 'streaming'),
        );
        const provider = new VercelAiProvider('fixture/model', {
          config: {
            ...config,
            streaming: mode === 'streaming',
            ...(mode === 'structured' ? { responseSchema: { type: 'object' } } : {}),
          },
        });

        const result = await provider.callApi('Hello');

        expect(result).toEqual({
          output: text || 'Content filtered by provider',
          finishReason: 'content_filter',
          tokenUsage,
          isRefusal: true,
          guardrails: { flagged: true },
        });
      }
    },
  );

  it.each(['', '{"answer":'])(
    'retains structured truncation metadata when output is %j',
    async (text) => {
      fetchMock.mockResolvedValueOnce(
        gatewayResponse(text, 'length', false, undefined, { gateway: { cost: '0.012' } }),
      );
      const provider = new VercelAiProvider('fixture/model', {
        config: { ...config, responseSchema: { type: 'object' } },
      });

      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: text
          ? 'API call error: No object generated: could not parse the response.'
          : 'API call error: No output generated.',
        finishReason: 'length',
        tokenUsage,
        cost: 0.012,
      });
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'normalizes successful SDK text metadata with streaming=%s',
    async (streaming) => {
      fetchMock.mockResolvedValueOnce(gatewayResponse('Hello', 'stop', streaming));
      const provider = new VercelAiProvider('fixture/model', {
        config: { ...config, streaming },
      });

      expect(await provider.callApi('Hello')).toEqual({
        output: 'Hello',
        finishReason: 'stop',
        tokenUsage,
      });
    },
  );
});
