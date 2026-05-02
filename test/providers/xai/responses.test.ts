import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XAIResponsesProvider } from '../../../src/providers/xai/responses';

const mockFetchWithCache = vi.hoisted(() => vi.fn());
const mockFetchWithProxy = vi.hoisted(() => vi.fn());

class TestableXAIResponsesProvider extends XAIResponsesProvider {
  public getResolvedApiKey(): string | undefined {
    return this.getApiKey();
  }

  public getResolvedApiUrl(): string {
    return this.getApiUrl();
  }
}

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: (...args: any[]) => mockFetchWithCache(...args),
}));

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: (...args: any[]) => mockFetchWithProxy(...args),
}));

vi.mock('../../../src/logger');

function createSSEStream(events: string) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
}

describe('XAIResponsesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithCache.mockReset();
    mockFetchWithProxy.mockReset();
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'resp_123',
        model: 'grok-4.3',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'hello' }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('builds current xAI Responses tool payloads', async () => {
    const provider = new XAIResponsesProvider('grok-4.3', {
      config: {
        apiKey: 'test-key',
        tools: [
          { type: 'code_execution' },
          {
            type: 'file_search',
            vector_store_ids: ['collection_123'],
            max_num_results: 3,
          },
          {
            type: 'mcp',
            server_url: 'https://mcp.example.com',
            server_label: 'example',
            server_description: 'Example server',
            authorization: 'Bearer token',
          },
        ],
        include: ['reasoning.encrypted_content'],
        reasoning: { effort: 'high' },
        max_tool_calls: 4,
      },
    });

    await provider.callApi('hello');

    const [, request] = mockFetchWithCache.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.tools).toEqual([
      { type: 'code_execution' },
      {
        type: 'file_search',
        vector_store_ids: ['collection_123'],
        max_num_results: 3,
      },
      {
        type: 'mcp',
        server_url: 'https://mcp.example.com',
        server_label: 'example',
        server_description: 'Example server',
        authorization: 'Bearer token',
      },
    ]);
    expect(body.include).toEqual(['reasoning.encrypted_content']);
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_tool_calls).toBe(4);
  });

  it('uses regional endpoints when configured', () => {
    const provider = new TestableXAIResponsesProvider('grok-4.3', {
      config: {
        region: 'eu-west-1',
      },
    });

    expect(provider.getResolvedApiUrl()).toBe('https://eu-west-1.api.x.ai/v1');
  });

  it('honors env overrides for authentication and base URL', () => {
    const provider = new TestableXAIResponsesProvider('grok-4.3', {
      env: {
        XAI_API_KEY: 'env-key',
        XAI_API_BASE_URL: 'https://env.api.x.ai/v1',
      },
    });

    expect(provider.getResolvedApiKey()).toBe('env-key');
    expect(provider.getResolvedApiUrl()).toBe('https://env.api.x.ai/v1');
  });

  it('uses the exact billed xAI cost when the API returns cost ticks', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        id: 'resp_123',
        model: 'grok-4.3',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'hello' }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
          cost_in_usd_ticks: 12_500_000_000,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new XAIResponsesProvider('grok-4.3', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('hello');

    expect(result.cost).toBe(1.25);
  });

  it('parses streamed Responses API events', async () => {
    mockFetchWithProxy.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      body: createSSEStream(
        [
          'data: {"type":"response.output_text.delta","delta":"hel"}',
          '',
          'data: {"type":"response.output_text.delta","delta":"lo"}',
          '',
          'data: {"type":"response.completed","response":{"id":"resp_stream","model":"grok-4.3","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      ),
    });

    const provider = new XAIResponsesProvider('grok-4.3', {
      config: { apiKey: 'test-key', stream: true },
    });

    const result = await provider.callApi('hello');

    expect(mockFetchWithCache).not.toHaveBeenCalled();
    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      'https://api.x.ai/v1/responses',
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
      }),
    );
    expect(result.output).toBe('hello');
    expect(result.tokenUsage).toEqual({
      total: 15,
      prompt: 10,
      completion: 5,
      numRequests: 1,
    });
  });

  it('ignores malformed SSE events when later streamed output is valid', async () => {
    mockFetchWithProxy.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      body: createSSEStream(
        [
          'data: {"type":"response.output_text.delta","delta":"hel"}',
          '',
          'data: not-json',
          '',
          'data: {"type":"response.output_text.delta","delta":"lo"}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      ),
    });

    const provider = new XAIResponsesProvider('grok-4.3', {
      config: { apiKey: 'test-key', stream: true },
    });

    const result = await provider.callApi('hello');

    expect(result.output).toBe('hello');
  });

  it('returns an error when a streamed response has no output content', async () => {
    mockFetchWithProxy.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      body: createSSEStream(['data: not-json', '', 'data: [DONE]', ''].join('\n')),
    });

    const provider = new XAIResponsesProvider('grok-4.3', {
      config: { apiKey: 'test-key', stream: true },
    });

    const result = await provider.callApi('hello');

    expect(result.error).toBe(
      'xAI API error: xAI streaming response did not include output content\n\nIf this persists, verify your API key at https://x.ai/',
    );
  });
});
