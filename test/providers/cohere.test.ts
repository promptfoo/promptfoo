import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from '../../src/providers/cohere';
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
    vi.unstubAllEnvs();
  });

  it('recognizes the published Command A+ model ID', () => {
    expect(CohereChatCompletionProvider.COHERE_CHAT_MODELS).toContain('command-a-plus-05-2026');
  });

  it('recognizes the published North Mini Code model ID', () => {
    expect(CohereChatCompletionProvider.COHERE_CHAT_MODELS).toContain('north-mini-code-1-0');
  });

  it('uses the v2 Chat API for North Mini Code', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        finish_reason: 'COMPLETE',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 3, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('north-mini-code-1-0', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callApi('Fix the bug');

    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.cohere.ai/v2/chat');
    expect(JSON.parse((request as RequestInit).body as string)).toMatchObject({
      model: 'north-mini-code-1-0',
      messages: [{ role: 'user', content: 'Fix the bug' }],
    });
    expect(result).toMatchObject({
      output: 'Done',
      tokenUsage: { prompt: 3, completion: 1, total: 4 },
    });
  });

  it.each([
    'command-a-plus-05-2026',
    'north-mini-code-1-0',
  ])('honors a configured v2 API base URL for %s', async (modelName) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        finish_reason: 'COMPLETE',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider(modelName, {
      config: {
        apiKey: 'test-key',
        apiBaseUrl: 'https://vault.example.com/v2/',
      },
    });
    await provider.callApi('Private request');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe('https://vault.example.com/v2/chat');
  });

  it.each([
    ['v1', 'command-a-03-2025'],
    ['v2', 'command-a-plus-05-2026'],
  ])('prefers the provider-scoped client name for the %s Chat API', async (version, modelName) => {
    vi.stubEnv('COHERE_CLIENT_NAME', 'process-client');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data:
        version === 'v2'
          ? {
              message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
              usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
            }
          : {
              text: 'Done',
              token_count: { prompt_tokens: 1, response_tokens: 1, total_tokens: 2 },
            },
    } as any);

    const provider = new CohereChatCompletionProvider(modelName, {
      config: { apiKey: 'test-key' },
      env: { COHERE_CLIENT_NAME: 'provider-client' },
    });
    await provider.callApi('Hello');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect((request as RequestInit).headers).toMatchObject({
      'X-Client-Name': 'provider-client',
    });
  });

  it('honors a configured v1 API base URL without forwarding credentials or transport config', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        text: 'Private response',
        token_count: { prompt_tokens: 2, response_tokens: 1, total_tokens: 3 },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-03-2025', {
      config: {
        apiKey: 'private-test-key',
        apiBaseUrl: 'https://vault.example.com/v1///',
      },
    });
    await provider.callApi('Private request');

    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(url).toBe('https://vault.example.com/v1/chat');
    expect((request as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer private-test-key',
    });
    expect(body).toMatchObject({
      message: 'Private request',
      model: 'command-a-03-2025',
    });
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('apiBaseUrl');
    expect(JSON.stringify(body)).not.toContain('private-test-key');
    expect(JSON.stringify(body)).not.toContain('vault.example.com');
  });

  it.each([
    ['v1', 'command-a-03-2025'],
    ['v2', 'command-a-plus-05-2026'],
  ])('resolves configured, provider-scoped, and process API base URLs for the %s Chat API', async (version, modelName) => {
    vi.stubEnv('COHERE_API_BASE_URL', 'https://process-vault.example.com/v2//');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data:
        version === 'v2'
          ? {
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Private response' }],
              },
              usage: { tokens: { input_tokens: 2, output_tokens: 1 } },
            }
          : {
              text: 'Private response',
              token_count: { prompt_tokens: 2, response_tokens: 1, total_tokens: 3 },
            },
    } as any);

    const providerEnvProvider = new CohereChatCompletionProvider(modelName, {
      config: { apiKey: 'test-key' },
      env: { COHERE_API_BASE_URL: 'https://provider-vault.example.com/v1/' },
    });
    await providerEnvProvider.callApi('Private request');

    const processEnvProvider = new CohereChatCompletionProvider(modelName, {
      config: { apiKey: 'test-key' },
    });
    await processEnvProvider.callApi('Private request');

    const configuredProvider = new CohereChatCompletionProvider(modelName, {
      config: {
        apiKey: 'test-key',
        apiBaseUrl: 'https://configured-vault.example.com/v2/',
      },
      env: { COHERE_API_BASE_URL: 'https://provider-vault.example.com/v1/' },
    });
    await configuredProvider.callApi('Private request');

    expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([
      `https://provider-vault.example.com/${version}/chat`,
      `https://process-vault.example.com/${version}/chat`,
      `https://configured-vault.example.com/${version}/chat`,
    ]);
  });

  it.each([
    ['v1', 'command-a-03-2025'],
    ['v2', 'command-a-plus-05-2026'],
  ])('keeps provider-level transport config trusted for the %s Chat API', async (version, modelName) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data:
        version === 'v2'
          ? {
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Trusted response' }],
              },
              usage: { tokens: { input_tokens: 2, output_tokens: 1 } },
            }
          : {
              text: 'Trusted response',
              token_count: { prompt_tokens: 2, response_tokens: 1, total_tokens: 3 },
            },
    } as any);

    const provider = new CohereChatCompletionProvider(modelName, {
      config: {
        apiKey: 'provider-key',
        apiBaseUrl: 'https://trusted.example.com',
        temperature: 0.2,
      },
    });
    await provider.callApi('Trusted request', {
      prompt: {
        config: {
          apiKey: 'prompt-key',
          apiBaseUrl: 'https://untrusted.example.com',
          temperature: 0.9,
        },
      },
    } as any);

    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(url).toBe(`https://trusted.example.com/${version}/chat`);
    expect((request as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer provider-key',
    });
    expect(body).toMatchObject({ temperature: 0.9 });
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('apiBaseUrl');
  });

  it('does not accept an API key from prompt config', async () => {
    vi.stubEnv('COHERE_API_KEY', '');
    const provider = new CohereChatCompletionProvider('command-a-03-2025', {
      config: { apiBaseUrl: 'https://trusted.example.com' },
    });

    const result = await provider.callApi('Request', {
      prompt: {
        config: {
          apiKey: 'prompt-key',
          apiBaseUrl: 'https://untrusted.example.com',
        },
      },
    } as any);

    expect(result).toEqual({
      error: 'Cohere API key is not set. Please provide a valid apiKey.',
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
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
          { type: 'web', id: 'web-1', url: 'https://example.com/web' },
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
          { url: 'https://example.com/web', content: 'Grounded answer' },
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

  it.each(
    ['command-a-plus-05-2026', 'north-mini-code-1-0'].flatMap((modelName) => [
      {
        modelName,
        configuration: 'safety_mode OFF',
        config: { safety_mode: 'OFF' },
        expectedError:
          'Cohere v2 Chat API safety_mode "OFF" is not supported for command-a-plus-05-2026 or north-mini-code-1-0. Use "CONTEXTUAL" or "STRICT".',
      },
      {
        modelName,
        configuration: 'safety_mode STRICT with tools',
        config: {
          safety_mode: 'STRICT',
          tools: [
            {
              type: 'function',
              function: {
                name: 'lookup_weather',
                parameters: { type: 'object', properties: {} },
              },
            },
          ],
        },
        expectedError:
          'Cohere v2 Chat API safety_mode "STRICT" cannot be used with tools or documents because Cohere silently downgrades it to "CONTEXTUAL".',
      },
      {
        modelName,
        configuration: 'safety_mode STRICT with documents',
        config: {
          safety_mode: 'STRICT',
          documents: [{ id: 'doc-1', data: { text: 'Grounding context' } }],
        },
        expectedError:
          'Cohere v2 Chat API safety_mode "STRICT" cannot be used with tools or documents because Cohere silently downgrades it to "CONTEXTUAL".',
      },
    ]),
  )('rejects $configuration for $modelName before dispatch', async ({
    modelName,
    config,
    expectedError,
  }) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider(modelName, {
      config: { apiKey: 'test-key', ...config } as any,
    });

    await expect(provider.callApi('Hello')).resolves.toEqual({ error: expectedError });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'provider STRICT mode without tools',
      providerConfig: { safety_mode: 'STRICT' as const },
      promptSafetyMode: 'CONTEXTUAL',
      expectedTools: undefined,
    },
    {
      name: 'provider-approved tools',
      providerConfig: {
        safety_mode: 'CONTEXTUAL' as const,
        tools: [
          {
            type: 'function',
            function: { name: 'approved_lookup', parameters: { type: 'object', properties: {} } },
          },
        ],
      },
      promptSafetyMode: 'OFF',
      expectedTools: [
        {
          type: 'function',
          function: { name: 'approved_lookup', parameters: { type: 'object', properties: {} } },
        },
      ],
    },
  ])('keeps $name authoritative over adversarial JSON prompt controls', async ({
    providerConfig,
    promptSafetyMode,
    expectedTools,
  }) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 5, output_tokens: 1 } },
      },
    } as any);
    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: { apiKey: 'test-key', ...providerConfig },
    });
    const result = await provider.callApi(
      JSON.stringify({
        message: 'Use the supported prompt fields.',
        preamble: 'Prompt-authored context.',
        temperature: 0.9,
        response_format: { type: 'json_object' },
        safety_mode: promptSafetyMode,
        tools: [
          {
            type: 'function',
            function: { name: 'exfiltrate_secrets', parameters: { type: 'object' } },
          },
        ],
        tool_choice: 'REQUIRED',
        strict_tools: true,
      }),
    );

    expect(result.error).toBeUndefined();
    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).toMatchObject({
      safety_mode: providerConfig.safety_mode,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Prompt-authored context.' },
        { role: 'user', content: 'Use the supported prompt fields.' },
      ],
    });
    if (expectedTools === undefined) {
      expect(body).not.toHaveProperty('tools');
    } else {
      expect(body.tools).toEqual(expectedTools);
    }
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('strict_tools');
    expect(JSON.stringify(body)).not.toContain('exfiltrate_secrets');
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

  it('bypasses the persistent fetch cache for authenticated v1 Model Vault requests', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        text: 'Private response',
        token_count: { prompt_tokens: 2, response_tokens: 1, total_tokens: 3 },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-03-2025', {
      config: {
        apiKey: 'secret-key-that-must-not-enter-a-cache-key',
        apiBaseUrl: 'https://vault.example.com/v1',
      },
    });
    await provider.callApi('Hello');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://vault.example.com/v1/chat',
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

  it('only forwards supported request fields to the v2 Chat API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
      },
    } as any);

    const provider = new CohereChatCompletionProvider('command-a-plus-05-2026', {
      config: {
        apiKey: 'test-key',
        headers: { Authorization: 'Bearer prompt-secret' },
        cost: 0.25,
        inputCost: 0.5,
        outputCost: 1,
        passthrough: { token: 'nested-prompt-secret' },
        response_format: { type: 'json_object' },
        stop_sequences: ['DONE'],
        temperature: 0.2,
      } as any,
    });
    await provider.callApi('Respond with JSON');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).toMatchObject({
      response_format: { type: 'json_object' },
      stop_sequences: ['DONE'],
      temperature: 0.2,
    });
    expect(body).not.toHaveProperty('headers');
    expect(body).not.toHaveProperty('cost');
    expect(body).not.toHaveProperty('inputCost');
    expect(body).not.toHaveProperty('outputCost');
    expect(body).not.toHaveProperty('passthrough');
    expect(JSON.stringify(body)).not.toContain('prompt-secret');
    expect(JSON.stringify(body)).not.toContain('nested-prompt-secret');
    expect((request as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
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

  it.each([
    {
      name: 'non-2xx',
      response: {
        cached: false,
        data: { text: 'This error response must not be accepted.' },
        status: 401,
        statusText: 'Unauthorized',
      },
      expectedError:
        'API error: 401 Unauthorized\n{"text":"This error response must not be accepted."}',
    },
    {
      name: 'nested error payload',
      response: {
        cached: false,
        data: { error: { message: 'Model Vault rejected the request.' } },
        status: 200,
        statusText: 'OK',
      },
      expectedError: 'Model Vault rejected the request.',
    },
  ])('surfaces $name failures from v1 custom endpoints', async ({ response, expectedError }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(response as any);
    const provider = new CohereChatCompletionProvider('command-a-03-2025', {
      config: {
        apiKey: 'private-key',
        apiBaseUrl: 'https://vault.example.com',
      },
    });

    await expect(provider.callApi('Hello')).resolves.toEqual({ error: expectedError });
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

describe('CohereEmbeddingProvider', () => {
  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('parses float embeddings returned by the Cohere v2 API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        embeddings: { float: [[0.1, 0.2]] },
        meta: { billed_units: { input_tokens: 2 } },
      },
    } as any);
    const provider = new CohereEmbeddingProvider('embed-v4.0', {
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.cohere.com/v2',
    });

    await expect(provider.callEmbeddingApi('Embed this')).resolves.toEqual({
      embedding: [0.1, 0.2],
      tokenUsage: { prompt: 2, total: 2, numRequests: 1 },
    });

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(JSON.parse((request as RequestInit).body as string)).toMatchObject({
      embedding_types: ['float'],
    });
  });

  it('bypasses the persistent fetch cache for authenticated private embedding requests', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);
    const provider = new CohereEmbeddingProvider('embed-english-v3.0', {
      apiKey: 'private-key-that-must-not-enter-a-cache-key',
      apiBaseUrl: 'https://vault.example.com',
    });

    await provider.callEmbeddingApi('Embed this');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://vault.example.com/embed',
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it.each([
    [
      'custom proxy path',
      'https://vault.example.com/cohere/',
      'https://vault.example.com/cohere/embed',
    ],
    ['custom API version', 'https://vault.example.com/v3/', 'https://vault.example.com/v3/embed'],
  ])('preserves an explicitly configured %s', async (_name, apiBaseUrl, expectedUrl) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);
    const provider = new CohereEmbeddingProvider('embed-english-v3.0', {
      apiKey: 'test-key',
      apiBaseUrl,
    });

    await provider.callEmbeddingApi('Embed this');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(expectedUrl);
  });

  it('uses the official v1 embedding endpoint by default', async () => {
    vi.stubEnv('COHERE_API_BASE_URL', '');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);
    const provider = new CohereEmbeddingProvider('embed-english-v3.0', {
      apiKey: 'test-key',
    });

    await provider.callEmbeddingApi('Embed this');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe('https://api.cohere.com/v1/embed');
    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(JSON.parse((request as RequestInit).body as string)).not.toHaveProperty(
      'embedding_types',
    );
  });

  it.each([
    ['config api.cohere.ai', 'config', 'https://api.cohere.ai/'],
    ['config api.cohere.com', 'config', 'https://api.cohere.com///'],
    ['COHERE_API_BASE_URL api.cohere.ai', 'env', 'https://api.cohere.ai'],
    ['COHERE_API_BASE_URL api.cohere.com', 'env', 'https://api.cohere.com/'],
  ])('adds v1 for a versionless official host from %s', async (_name, source, apiBaseUrl) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);
    if (source === 'env') {
      vi.stubEnv('COHERE_API_BASE_URL', apiBaseUrl);
    }
    const provider = new CohereEmbeddingProvider('embed-english-v3.0', {
      apiKey: 'test-key',
      ...(source === 'config' ? { apiBaseUrl } : {}),
    });

    await provider.callEmbeddingApi('Embed this');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(
      `${apiBaseUrl.replace(/\/+$/, '')}/v1/embed`,
    );
  });

  it('prefers the provider-scoped client name for embedding requests', async () => {
    vi.stubEnv('COHERE_CLIENT_NAME', 'process-client');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);
    const provider = new CohereEmbeddingProvider(
      'embed-v4.0',
      { apiKey: 'test-key' },
      { COHERE_CLIENT_NAME: 'provider-client' },
    );

    await provider.callEmbeddingApi('Embed this');

    const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect((request as RequestInit).headers).toMatchObject({
      'X-Client-Name': 'provider-client',
    });
  });

  it.each([
    {
      name: 'versionless explicit config',
      config: { apiBaseUrl: 'https://explicit-versionless.example.com///' },
      expectedUrl: 'https://explicit-versionless.example.com/embed',
    },
    {
      name: 'v2 provider env',
      providerEnv: { COHERE_API_BASE_URL: 'https://provider-v2.example.com/v2///' },
      expectedUrl: 'https://provider-v2.example.com/v2/embed',
    },
    {
      name: 'versionless loader context env',
      contextEnv: { COHERE_API_BASE_URL: 'https://context-versionless.example.com/' },
      expectedUrl: 'https://context-versionless.example.com/embed',
    },
    {
      name: 'v2 process env',
      processBaseUrl: 'https://process-v2.example.com/v2/',
      expectedUrl: 'https://process-v2.example.com/v2/embed',
    },
  ])('preserves $name when building the embedding endpoint', async ({
    config,
    providerEnv,
    contextEnv,
    processBaseUrl,
    expectedUrl,
  }) => {
    vi.stubEnv('COHERE_API_KEY', 'test-key');
    vi.stubEnv(
      'COHERE_API_BASE_URL',
      processBaseUrl || 'https://unused-process-fallback.example.com',
    );
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { embeddings: [[0.1, 0.2]] },
    } as any);

    const provider = (await loadApiProvider('cohere:embedding:embed-english-v3.0', {
      env: contextEnv,
      options: {
        config,
        env: providerEnv,
      },
    })) as CohereEmbeddingProvider;
    await provider.callEmbeddingApi('Embed this');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(expectedUrl);
  });

  it.each([
    {
      name: 'flat explicit config',
      config: {
        apiKey: 'explicit-only-key',
        apiBaseUrl: 'https://explicit-only.example.com/v1///',
        truncate: 'END',
      },
      expectedUrl: 'https://explicit-only.example.com/v1/embed',
      expectedKey: 'explicit-only-key',
      expectedTruncate: 'END',
    },
    {
      name: 'provider-scoped env',
      providerEnv: {
        COHERE_API_KEY: 'provider-key',
        COHERE_API_BASE_URL: 'https://provider-env.example.com/v1/',
      },
      expectedUrl: 'https://provider-env.example.com/v1/embed',
      expectedKey: 'provider-key',
      expectedTruncate: 'NONE',
    },
    {
      name: 'loader context env',
      contextEnv: {
        COHERE_API_KEY: 'context-key',
        COHERE_API_BASE_URL: 'https://context-env.example.com/v1/',
      },
      expectedUrl: 'https://context-env.example.com/v1/embed',
      expectedKey: 'context-key',
      expectedTruncate: 'NONE',
    },
    {
      name: 'process env',
      expectedUrl: 'https://process-env.example.com/v1/embed',
      expectedKey: 'process-key',
      expectedTruncate: 'NONE',
    },
    {
      name: 'explicit config precedence',
      config: {
        apiKey: 'highest-priority-key',
        apiKeyEnvar: 'CUSTOM_COHERE_API_KEY',
        apiBaseUrl: 'https://highest-priority.example.com/v1/',
      },
      providerEnv: {
        COHERE_API_KEY: 'provider-key',
        COHERE_API_BASE_URL: 'https://provider-env.example.com/v1/',
        CUSTOM_COHERE_API_KEY: 'provider-custom-key',
      },
      contextEnv: {
        COHERE_API_KEY: 'context-key',
        COHERE_API_BASE_URL: 'https://context-env.example.com/v1/',
      },
      expectedUrl: 'https://highest-priority.example.com/v1/embed',
      expectedKey: 'highest-priority-key',
      expectedTruncate: 'NONE',
    },
    {
      name: 'configured apiKeyEnvar',
      config: { apiKeyEnvar: 'CUSTOM_COHERE_API_KEY' },
      providerEnv: {
        COHERE_API_BASE_URL: 'https://provider-env.example.com/v1/',
        CUSTOM_COHERE_API_KEY: 'provider-custom-key',
      },
      expectedUrl: 'https://provider-env.example.com/v1/embed',
      expectedKey: 'provider-custom-key',
      expectedTruncate: 'NONE',
    },
  ])('loads Cohere embedding routing and credentials through $name', async ({
    config,
    providerEnv,
    contextEnv,
    expectedUrl,
    expectedKey,
    expectedTruncate,
  }) => {
    vi.stubEnv('COHERE_API_KEY', 'process-key');
    vi.stubEnv('COHERE_API_BASE_URL', 'https://process-env.example.com/v1///');
    vi.stubEnv('CUSTOM_COHERE_API_KEY', 'process-custom-key');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        embeddings: [[0.1, 0.2]],
        meta: { billed_units: { input_tokens: 2 } },
      },
    } as any);

    const provider = (await loadApiProvider('cohere:embedding:embed-english-v3.0', {
      env: contextEnv,
      options: { config, env: providerEnv },
    })) as CohereEmbeddingProvider;
    await provider.callEmbeddingApi('Embed this');

    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(expectedUrl);
    expect((request as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${expectedKey}`,
    });
    expect(JSON.parse((request as RequestInit).body as string)).toMatchObject({
      model: 'embed-english-v3.0',
      texts: ['Embed this'],
      truncate: expectedTruncate,
    });
  });
});
