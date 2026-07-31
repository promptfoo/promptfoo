import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';
import { loadApiProvider } from '../../src/providers/index';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

describe('CohereChatCompletionProvider', () => {
  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('recognizes the published Command A+ model ID', () => {
    expect(CohereChatCompletionProvider.COHERE_CHAT_MODELS).toContain('command-a-plus-05-2026');
  });

  it('uses the v2 Chat API for Command A+ and parses its response', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        id: 'response-id',
        finish_reason: 'COMPLETE',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ' world' },
          ],
        },
        usage: {
          billed_units: { input_tokens: 4, output_tokens: 2 },
          tokens: { input_tokens: 5, output_tokens: 2 },
        },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callApi('Say hello');

    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.cohere.ai/v2/chat');
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'command-a-plus-05-2026',
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('connectors');
    expect(body).not.toHaveProperty('prompt_truncation');
    expect(body).not.toHaveProperty('search_queries_only');
    expect(result).toEqual({
      cached: false,
      output: 'Hello world',
      tokenUsage: {
        cached: 0,
        completion: 2,
        numRequests: 1,
        prompt: 5,
        total: 7,
      },
    });
  });

  it('converts legacy Cohere chat history and preamble to v2 messages', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 8, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc',
        preamble_override: 'Be concise.',
        chatHistory: [
          { role: 'USER', message: 'Hello' },
          { role: 'CHATBOT', message: 'Hi' },
        ],
      },
    });
    await provider.callApi('Continue');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Continue' },
    ]);
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('chatHistory');
    expect(body).not.toHaveProperty('linkedTargetId');
    expect(body).not.toHaveProperty('preamble_override');
  });

  it('uses a standard JSON message-array prompt as v2 messages', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 4, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });
    const messages = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Summarize this.' },
    ];
    await provider.callApi(JSON.stringify(messages));

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.messages).toEqual(messages);
  });

  it('prepends preferred configured preamble and history to a JSON message-array prompt', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 8, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        preamble: 'Configured system context.',
        preamble_override: 'Legacy system context.',
        chat_history: [
          { role: 'USER', message: 'Earlier question' },
          { role: 'CHATBOT', message: 'Earlier answer' },
        ],
        chatHistory: [{ role: 'USER', message: 'Legacy history should not be duplicated' }],
      },
    });
    const promptMessages = [
      { role: 'system', content: 'Prompt-defined system context.' },
      { role: 'user', content: 'Current question' },
    ];
    await provider.callApi(JSON.stringify(promptMessages));

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Configured system context.' },
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      ...promptMessages,
    ]);
  });

  it('returns v2 tool calls when the response has no text content', async () => {
    const toolCalls = [
      {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"Tokyo"}' },
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [], tool_calls: toolCalls },
        usage: { tokens: { input_tokens: 6, output_tokens: 3 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('What is the weather?')).resolves.toMatchObject({
      output: toolCalls,
      tokenUsage: { prompt: 6, completion: 3, total: 9 },
    });
  });

  it('returns the full v2 message when text and tool calls are both present', async () => {
    const toolCalls = [
      {
        id: 'call_456',
        type: 'function',
        function: { name: 'search', arguments: '{"query":"test"}' },
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'I will search for that.' }],
          tool_calls: toolCalls,
        },
        usage: { tokens: { input_tokens: 5, output_tokens: 4 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Search for test')).resolves.toMatchObject({
      output: {
        role: 'assistant',
        content: 'I will search for that.',
        tool_calls: toolCalls,
      },
    });
  });

  it('bypasses the persistent fetch cache for authenticated v2 requests', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'secret-key-that-must-not-enter-a-cache-key' },
    });
    await provider.callApi('Hello');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.cohere.ai/v2/chat',
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('does not forward promptfoo loader metadata to the v2 Chat API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = await loadApiProvider('cohere:command-a-plus-05-2026', {
      basePath: '/absolute/path/to/promptfoo-config',
      options: {
        config: {
          apiKey: 'test-key',
          response_format: { type: 'json_object' },
          stop_sequences: ['DONE'],
        },
      },
    });
    await provider.callApi('Respond with JSON');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).not.toHaveProperty('basePath');
    expect(body).toMatchObject({
      response_format: { type: 'json_object' },
      stop_sequences: ['DONE'],
    });
  });

  it('returns v2 API error messages', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { message: 'invalid request: model is unavailable' },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Hello')).resolves.toEqual({
      error: 'invalid request: model is unavailable',
    });
  });
});
