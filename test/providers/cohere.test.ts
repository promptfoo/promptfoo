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

  it('preserves and normalizes citations from v2 text responses', async () => {
    const citations = [
      {
        start: 0,
        end: 15,
        text: 'Grounded answer',
        type: 'TEXT_CONTENT',
        sources: [
          {
            type: 'document',
            id: 'doc-1',
            document: { title: 'Source document', url: 'https://example.com/source' },
          },
          { type: 'tool', id: 'tool-1', tool_output: { temperature: '24 C' } },
        ],
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Grounded answer' }],
          citations,
        },
        usage: { tokens: { input_tokens: 4, output_tokens: 2 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Answer with sources')).resolves.toMatchObject({
      output: 'Grounded answer',
      metadata: {
        citations: [
          { url: 'https://example.com/source', content: 'Grounded answer' },
          { source: 'tool-1', content: 'Grounded answer' },
        ],
        cohere: { citations },
      },
    });
  });

  it('preserves v2 server cache usage while marking a local cached response fully cached', async () => {
    const data = {
      message: { role: 'assistant', content: [{ type: 'text', text: 'Cached answer' }] },
      usage: {
        cached_tokens: 3,
        tokens: { input_tokens: 5, output_tokens: 2 },
      },
    };
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce({ cached: false, data } as any)
      .mockResolvedValueOnce({ cached: true, data } as any);
    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    const serverResponse = await provider.callApi('First request');
    const localCacheResponse = await provider.callApi('Repeated request');

    expect(serverResponse.tokenUsage).toMatchObject({
      cached: 3,
      prompt: 5,
      completion: 2,
      total: 7,
    });
    expect(localCacheResponse.tokenUsage).toMatchObject({
      cached: 7,
      prompt: 5,
      completion: 2,
      total: 7,
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

  it.each([
    [
      'a non-array chat_history',
      { role: 'USER', message: 'Provider history' },
      'Cohere v2 Chat API chat_history must be an array.',
    ],
    [
      'a chat_history entry without a role',
      [{ message: 'Provider history' }],
      'Cohere v2 Chat API chat_history[0].role must be a non-empty string.',
    ],
    [
      'a non-object chat_history entry',
      ['Provider history'],
      'Cohere v2 Chat API chat_history[0] must be an object.',
    ],
    [
      'a chat_history entry without a message',
      [{ role: 'USER' }],
      'Cohere v2 Chat API chat_history[0].message must be a non-empty string.',
    ],
    [
      'a chat_history entry with an empty message',
      [{ role: 'USER', message: '   ' }],
      'Cohere v2 Chat API chat_history[0].message must be a non-empty string.',
    ],
    [
      'a chat_history entry with a non-string message',
      [{ role: 'USER', message: { text: 'Provider history' } }],
      'Cohere v2 Chat API chat_history[0].message must be a non-empty string.',
    ],
  ])('returns a provider error for %s', async (_description, chatHistory, expectedError) => {
    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        chat_history: chatHistory,
      } as any,
    });

    await expect(provider.callApi('Continue')).resolves.toEqual({ error: expectedError });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('prefers prompt-config aliases over provider canonical v2 message fields', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 5, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        preamble: 'Provider system context.',
        chat_history: [{ role: 'USER', message: 'Provider history' }],
      },
    });
    await provider.callApi('Continue', {
      prompt: {
        config: {
          preamble_override: 'Prompt system context.',
          chatHistory: [{ role: 'USER', message: 'Prompt history' }],
        },
      },
    } as any);

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Prompt system context.' },
      { role: 'user', content: 'Prompt history' },
      { role: 'user', content: 'Continue' },
    ]);
  });

  it('prefers JSON prompt aliases over provider canonical v2 message fields', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 5, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        preamble: 'Provider system context.',
        chat_history: [{ role: 'USER', message: 'Provider history' }],
      },
    });
    await provider.callApi(
      JSON.stringify({
        message: 'Continue',
        preamble_override: 'Prompt system context.',
        chatHistory: [{ role: 'USER', message: 'Prompt history' }],
      }),
    );

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Prompt system context.' },
      { role: 'user', content: 'Prompt history' },
      { role: 'user', content: 'Continue' },
    ]);
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

  it('normalizes legacy documents and citation quality for the v2 Chat API', async () => {
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
        documents: [
          'A plain text document.',
          { data: 'A v2 document with string data.' },
          { id: 'string-doc', data: 'A named v2 document with string data.' },
          {
            id: 'legacy-doc',
            title: 'Legacy document',
            snippet: 'Legacy v1 document payload.',
            citation_quality: 'accurate',
          },
          {
            id: 'v2-doc',
            data: { title: 'Already v2', snippet: 'Keep this payload.' },
          },
        ],
      } as any,
    });
    await provider.callApi('Use the documents');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.documents).toEqual([
      'A plain text document.',
      'A v2 document with string data.',
      { id: 'string-doc', data: { text: 'A named v2 document with string data.' } },
      {
        id: 'legacy-doc',
        data: {
          title: 'Legacy document',
          snippet: 'Legacy v1 document payload.',
        },
      },
      {
        id: 'v2-doc',
        data: { title: 'Already v2', snippet: 'Keep this payload.' },
      },
    ]);
    expect(body.citation_options).toEqual({ mode: 'ACCURATE' });
    expect(JSON.stringify(body.documents)).not.toContain('citation_quality');
  });

  it('preserves explicit v2 citation options over legacy document citation quality', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 4, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        citation_options: { mode: 'accurate' },
        documents: [
          {
            id: 'configured-doc',
            text: 'Configured payload',
            citation_quality: 'accurate',
          },
        ],
      } as any,
    });
    await provider.callApi(
      JSON.stringify({
        message: 'Use the document',
        citation_options: { mode: 'fast' },
        documents: [
          {
            id: 'prompt-doc',
            text: 'Prompt payload',
            citation_quality: 'accurate',
          },
        ],
      }),
    );

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body.citation_options).toEqual({ mode: 'FAST' });
    expect(body.documents).toEqual([{ id: 'prompt-doc', data: { text: 'Prompt payload' } }]);
  });

  it('appends unique v2 document sources when prompt config enables showDocuments', async () => {
    const firstDocument = { id: 'doc-1', title: 'First document' };
    const secondDocument = { id: 'doc-2', title: 'Second document' };
    const firstDocumentSource = {
      type: 'document',
      id: 'doc-1',
      document: firstDocument,
    };
    const secondDocumentSource = {
      type: 'document',
      id: 'doc-2',
      document: secondDocument,
    };
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Grounded answer' }],
          citations: [
            {
              sources: [
                firstDocumentSource,
                { type: 'web', id: 'web-1', url: 'https://example.com' },
              ],
            },
            {
              sources: [
                { ...firstDocumentSource, id: 'duplicate-reference' },
                secondDocumentSource,
              ],
            },
          ],
        },
        usage: { tokens: { input_tokens: 9, output_tokens: 3 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key', showDocuments: false },
    });
    const result = await provider.callApi(
      JSON.stringify({ message: 'Use the cited documents', showDocuments: true }),
    );

    expect(result.output).toBe(
      `Grounded answer\n\nDocuments:\n${JSON.stringify(firstDocument)}\n${JSON.stringify(
        secondDocument,
      )}`,
    );
    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).not.toHaveProperty('showDocuments');
  });

  it('rejects prompt-level showSearchQueries for the v2 Chat API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key', showSearchQueries: false },
    });

    await expect(
      provider.callApi(JSON.stringify({ message: 'Search', showSearchQueries: true })),
    ).resolves.toEqual({
      error: 'Cohere v2 Chat API does not return generated search queries.',
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
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

  it.each([
    ['empty content', []],
    ['non-text content', [{ type: 'citation', url: 'https://example.com' }]],
    ['invalid text content', [{ type: 'text', text: 42 }]],
  ])('rejects a v2 response with %s and no tool calls', async (_label, content) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content },
        usage: { tokens: { input_tokens: 1, output_tokens: 0 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Hello')).resolves.toEqual({
      error: 'Cohere v2 Chat API response did not contain text content.',
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
    const document = { id: 'doc-1', title: 'One document' };
    const citations = [
      {
        sources: [
          { type: 'document', id: 'doc-1', document },
          { type: 'document', id: 'duplicate', document },
        ],
      },
    ];
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'I will search for that.' }],
          tool_calls: toolCalls,
          citations,
        },
        usage: { tokens: { input_tokens: 5, output_tokens: 4 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key', showDocuments: true },
    });

    const result = await provider.callApi('Search for test');
    expect(result).toMatchObject({
      output: {
        role: 'assistant',
        content: `I will search for that.\n\nDocuments:\n${JSON.stringify(document)}`,
        tool_calls: toolCalls,
        citations,
      },
    });
    expect((result.output as { content: string }).content.match(/Documents:/g)).toHaveLength(1);
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

  it('does not forward prompt wrapper metadata to the v2 Chat API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);
    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('Respond with JSON', {
      prompt: {
        config: {
          prefix: 'Evaluation prefix',
          suffix: 'Evaluation suffix',
          provider: { id: 'openai:gpt-5.6' },
          response_format: { type: 'json_object' },
        },
      },
    } as any);

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).not.toHaveProperty('prefix');
    expect(body).not.toHaveProperty('suffix');
    expect(body).not.toHaveProperty('provider');
    expect(body.response_format).toEqual({ type: 'json_object' });
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

  it('returns an HTTP error for unsuccessful v2 responses before parsing content', async () => {
    const data = {
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'This unsuccessful response must not be accepted.' }],
      },
    };
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data,
      status: 503,
      statusText: 'Service Unavailable',
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Hello')).resolves.toEqual({
      error: `API error: 503 Service Unavailable\n${JSON.stringify(data)}`,
    });
  });
});
