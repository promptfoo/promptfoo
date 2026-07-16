import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { AzureRealtimeProvider } from '../../../src/providers/azure/realtime';
import { OpenAiRealtimeProvider } from '../../../src/providers/openai/realtime';
import { mockProcessEnv } from '../../util/utils';

const { mockCallApi, mockCleanup, mockRegister, mockUnregister } = vi.hoisted(() => ({
  mockCallApi: vi.fn(),
  mockCleanup: vi.fn(),
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
}));

vi.mock('../../../src/providers/openai/realtime', () => ({
  OpenAiRealtimeProvider: vi.fn().mockImplementation(function (_modelName, options) {
    return { config: options.config, callApi: mockCallApi, cleanup: mockCleanup };
  }),
}));

vi.mock('../../../src/providers/providerRegistry', () => ({
  providerRegistry: { register: mockRegister, unregister: mockUnregister },
}));

describe('AzureRealtimeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallApi.mockResolvedValue({
      output: 'hello',
      tokenUsage: { prompt: 1_000, completion: 500, total: 1_500 },
      metadata: {
        usage: {
          input_tokens: 1_000,
          input_token_details: { text_tokens: 800, audio_tokens: 200, cached_tokens: 0 },
          output_tokens: 500,
          output_token_details: { text_tokens: 400, audio_tokens: 100 },
        },
      },
    });
  });

  it('uses the GA Azure websocket endpoint and prices realtime audio tokens', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: {
        apiHost: 'example.openai.azure.com',
        apiKey: 'azure-key',
        modalities: ['text', 'audio'],
      },
    });

    const result = await provider.callApi('hello');

    expect(OpenAiRealtimeProvider).toHaveBeenCalledWith(
      'gpt-realtime-1.5-2026-02-23',
      expect.objectContaining({
        config: expect.objectContaining({
          apiHost: 'example.openai.azure.com/openai',
          apiBaseUrl: 'https://example.openai.azure.com/openai/v1',
          apiKey: 'azure-key',
          azureApiKeyAuth: true,
          headers: { 'api-key': 'azure-key' },
        }),
      }),
    );
    expect(result.cost).toBeCloseTo((800 * 4 + 200 * 32 + 400 * 16 + 100 * 64) / 1e6, 12);
  });

  it('preserves an Azure base URL that already ends in openai/v1', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: {
        apiBaseUrl: 'https://example.openai.azure.com/openai/v1/',
        apiKey: 'azure-key',
      },
    });

    await provider.callApi('hello');

    expect(OpenAiRealtimeProvider).toHaveBeenCalledWith(
      'gpt-realtime-1.5-2026-02-23',
      expect.objectContaining({
        config: expect.objectContaining({
          apiHost: 'example.openai.azure.com/openai',
          apiBaseUrl: 'https://example.openai.azure.com/openai/v1',
        }),
      }),
    );
  });

  it('preserves an explicitly configured HTTP realtime proxy URL', async () => {
    mockProcessEnv({ OPENAI_API_HOST: 'wrong.example' });
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: {
        apiBaseUrl: 'http://127.0.0.1:15500/proxy/openai/v1',
        apiKey: 'azure-key',
      },
    });

    await provider.callApi('hello');

    expect(OpenAiRealtimeProvider).toHaveBeenCalledWith(
      'gpt-realtime-1.5-2026-02-23',
      expect.objectContaining({
        config: expect.objectContaining({
          apiHost: undefined,
          apiBaseUrl: 'http://127.0.0.1:15500/proxy/openai/v1',
        }),
      }),
    );
  });

  it('does not allow OPENAI_API_HOST to override the Azure realtime endpoint', async () => {
    mockProcessEnv({ OPENAI_API_HOST: 'wrong.example' });
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: {
        apiBaseUrl: 'https://proxy.example/azure/openai/v1',
        apiKey: 'azure-key',
      },
    });

    await provider.callApi('hello');

    expect(OpenAiRealtimeProvider).toHaveBeenCalledWith(
      'gpt-realtime-1.5-2026-02-23',
      expect.objectContaining({
        config: expect.objectContaining({
          apiHost: 'proxy.example/azure/openai',
          apiBaseUrl: 'https://proxy.example/azure/openai/v1',
        }),
      }),
    );
  });

  it('forwards Microsoft Entra bearer authentication', async () => {
    mockProcessEnv({ AZURE_API_KEY: undefined, AZURE_OPENAI_API_KEY: undefined });
    vi.spyOn(AzureGenericProvider.prototype, 'getAccessToken').mockResolvedValue('entra-token');
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com' },
    });

    await provider.callApi('hello');

    expect(OpenAiRealtimeProvider).toHaveBeenCalledWith(
      'gpt-realtime-1.5-2026-02-23',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'entra-token',
          headers: { Authorization: 'Bearer entra-token' },
        }),
      }),
    );
  });

  it('prices cached audio and image tokens from realtime usage details', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'hello',
      tokenUsage: { prompt: 1_030, completion: 30, total: 1_060 },
      metadata: {
        usage: {
          input_tokens: 1_030,
          input_token_details: {
            text_tokens: 1_000,
            audio_tokens: 20,
            image_tokens: 10,
            cached_tokens: 100,
            cached_tokens_details: { text_tokens: 70, audio_tokens: 20, image_tokens: 10 },
          },
          output_tokens: 30,
          output_token_details: { text_tokens: 20, audio_tokens: 10 },
        },
      },
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-mini-2025-10-06', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi('hello');

    expect(result.cost).toBeCloseTo(
      (930 * 0.6 + 70 * 0.06 + 20 * 0.3 + 10 * 0.08 + 20 * 2.4 + 10 * 20) / 1e6,
      12,
    );
    expect(result.tokenUsage).toEqual({
      prompt: 1_030,
      completion: 30,
      total: 1_060,
      cached: 100,
      numRequests: 1,
    });
  });

  it('aggregates every realtime response when a tool call creates a follow-up turn', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'hello',
      tokenUsage: { prompt: 200, completion: 50, total: 250 },
      metadata: {
        usage: { input_tokens: 200, output_tokens: 50, total_tokens: 250 },
        usageEvents: [
          {
            input_tokens: 1_000,
            input_token_details: {
              text_tokens: 800,
              audio_tokens: 200,
              cached_tokens: 100,
              cached_tokens_details: { text_tokens: 100 },
            },
            output_tokens: 500,
            output_token_details: { text_tokens: 400, audio_tokens: 100 },
            total_tokens: 1_500,
          },
          { input_tokens: 200, output_tokens: 50, total_tokens: 250 },
        ],
      },
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-mini-2025-10-06', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi('hello');

    expect(result.tokenUsage).toEqual({
      prompt: 1_200,
      completion: 550,
      total: 1_750,
      cached: 100,
      numRequests: 2,
    });
    expect(result.cost).toBeCloseTo(
      (700 * 0.6 + 100 * 0.06 + 200 * 10 + 400 * 2.4 + 100 * 20 + 200 * 0.6 + 50 * 2.4) / 1e6,
      12,
    );
  });

  it('charges realtime image tokens across tool-call response events', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'hello',
      tokenUsage: { prompt: 1_000, completion: 0, total: 1_000 },
      metadata: {
        usageEvents: [
          {
            input_tokens: 1_000,
            input_token_details: { image_tokens: 1_000 },
            output_tokens: 0,
          },
          {
            input_tokens: 1_000,
            input_token_details: { image_tokens: 1_000 },
            output_tokens: 0,
          },
        ],
      },
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=' } }],
        },
      ]),
    );

    expect(result.cost).toBeCloseTo((2_000 * 5) / 1e6, 12);
    expect(result.tokenUsage).toMatchObject({ prompt: 2_000, completion: 0, numRequests: 2 });
  });

  it('preserves cached token usage when a realtime response does not include metadata usage', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'hello',
      tokenUsage: { prompt: 1_000, completion: 500, total: 1_500, cached: 250 },
      metadata: {},
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-mini-2025-10-06', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi('hello');

    expect(result.cost).toBeCloseTo((750 * 0.6 + 250 * 0.06 + 500 * 2.4) / 1e6, 12);
  });

  it('cleans up the delegated realtime connection', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await provider.callApi('hello');
    provider.cleanup();

    expect(mockCleanup).toHaveBeenCalledOnce();
    expect(mockUnregister).toHaveBeenCalledWith(provider);
  });

  it('registers the delegated realtime connection for evaluator shutdown', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await provider.callApi('hello');
    await provider.callApi('follow up');

    expect(mockRegister).toHaveBeenCalledOnce();
    expect(mockRegister).toHaveBeenCalledWith(provider);

    await provider.shutdown();

    expect(mockCleanup).toHaveBeenCalledTimes(2);
    expect(mockUnregister).toHaveBeenCalledWith(provider);
  });

  it('preserves the realtime conversation-context default across calls', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await provider.callApi('hello');
    await provider.callApi('follow up', {
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any);

    const delegatedProvider = vi.mocked(OpenAiRealtimeProvider).mock.results[1]?.value;
    expect(delegatedProvider.config.maintainContext).toBe(true);
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it('does not retain context across stateless realtime evaluations', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key', maintainContext: true },
    });

    await provider.callApi('first independent prompt');
    await provider.callApi('second independent prompt');

    expect(vi.mocked(OpenAiRealtimeProvider).mock.results[0]?.value.config.maintainContext).toBe(
      false,
    );
    expect((provider as any).realtimeProviders.size).toBe(0);
    expect(mockCleanup).toHaveBeenCalledTimes(2);
  });

  it('releases a stateless realtime delegate when the request fails', async () => {
    mockCallApi.mockRejectedValueOnce(new Error('realtime request failed'));
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await expect(provider.callApi('hello')).rejects.toThrow('realtime request failed');

    expect((provider as any).realtimeProviders.size).toBe(0);
    expect(mockCleanup).toHaveBeenCalledOnce();
  });

  it('prices realtime image tokens at the published image-token rate', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'an image',
      tokenUsage: { prompt: 100, completion: 0, total: 100 },
      metadata: {
        usage: {
          input_tokens: 100,
          input_token_details: { text_tokens: 0, image_tokens: 100 },
          output_tokens: 0,
        },
      },
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,aW1hZ2U=' }],
        },
      ]),
    );

    expect(result.cost).toBeCloseTo((100 * 5) / 1e6, 12);
  });

  it('does not charge a historical realtime image that is not sent on the final user turn', async () => {
    mockCallApi.mockResolvedValueOnce({
      output: 'text only',
      tokenUsage: { prompt: 10, completion: 0, total: 10 },
      metadata: { usage: { input_tokens: 10, output_tokens: 0 } },
    });
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    const result = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,aQ==' }],
        },
        { role: 'assistant', content: 'An image.' },
        { role: 'user', content: 'Thanks.' },
      ]),
    );

    expect(result.cost).toBeCloseTo((10 * 4) / 1e6, 12);
  });

  it('isolates persistent realtime delegates by conversation ID', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });
    const contextA = { test: { metadata: { conversationId: 'conversation-a' } } } as any;
    const contextB = { test: { metadata: { conversationId: 'conversation-b' } } } as any;

    await provider.callApi('hello a', contextA);
    await provider.callApi('hello b', contextB);
    await provider.callApi('follow up a', contextA);

    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenCalledTimes(3);

    provider.cleanup();

    expect(mockCleanup).toHaveBeenCalledTimes(2);
  });

  it('isolates persistent realtime delegates by prompt identity within one conversation', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });
    const contextA = {
      prompt: { id: 'prompt-a', config: {} },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any;
    const contextB = {
      prompt: { id: 'prompt-b', config: {} },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any;

    await provider.callApi('hello a', contextA);
    await provider.callApi('hello b', contextB);
    await provider.callApi('follow up a', contextA);

    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenCalledTimes(3);
  });

  it('keeps numeric and string realtime conversation IDs isolated', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });
    const numericContext = { test: { metadata: { conversationId: 1 } } } as any;
    const stringContext = { test: { metadata: { conversationId: '1' } } } as any;

    await provider.callApi('hello numeric', numericContext);
    await provider.callApi('hello string', stringContext);
    await provider.callApi('follow up numeric', numericContext);

    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenCalledTimes(3);
  });

  it('treats empty Azure realtime conversation IDs as stateless', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });
    const context = { test: { metadata: { conversationId: '' } } } as any;

    await provider.callApi('hello', context);
    await provider.callApi('follow up', context);

    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(mockCleanup).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it('isolates normal evaluator prompts that have labels but no explicit IDs', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });
    const contextA = {
      prompt: { label: 'prompt a', raw: 'first prompt template', config: {} },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any;
    const contextB = {
      prompt: { label: 'prompt b', raw: 'second prompt template', config: {} },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any;

    await provider.callApi('hello a', contextA);
    await provider.callApi('hello b', contextB);
    await provider.callApi('follow up a', contextA);

    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenCalledTimes(3);
  });

  it('applies prompt-level realtime configuration overrides', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key', modalities: ['audio'] },
    });

    await provider.callApi('hello', {
      prompt: {
        id: 'prompt-a',
        config: {
          apiBaseUrl: 'http://127.0.0.1:15500/alternate/openai/v1',
          apiKey: 'prompt-key',
          modalities: ['text'],
          instructions: 'Be concise',
          websocketTimeout: 12_345,
        },
      },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any);

    const delegatedProvider = vi.mocked(OpenAiRealtimeProvider).mock.results[0]?.value;
    expect(delegatedProvider.config).toMatchObject({
      modalities: ['text'],
      apiHost: undefined,
      apiBaseUrl: 'http://127.0.0.1:15500/alternate/openai/v1',
      apiKey: 'prompt-key',
      headers: { 'api-key': 'prompt-key' },
      instructions: 'Be concise',
      websocketTimeout: 12_345,
    });
  });

  it('prefers a prompt-level API host over an inherited base URL', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiBaseUrl: 'https://base.openai.azure.com/openai/v1', apiKey: 'azure-key' },
    });

    await provider.callApi('hello', {
      prompt: {
        id: 'prompt-host',
        config: { apiHost: 'prompt.openai.azure.com', apiKey: 'prompt-key' },
      },
    } as any);

    const delegatedProvider = vi.mocked(OpenAiRealtimeProvider).mock.results[0]?.value;
    expect(delegatedProvider.config).toMatchObject({
      apiHost: 'prompt.openai.azure.com/openai',
      apiBaseUrl: 'https://prompt.openai.azure.com/openai/v1',
      apiKey: 'prompt-key',
      headers: { 'api-key': 'prompt-key' },
    });
  });

  it('accepts prompt-only API-key environment overrides when base Entra initialization fails', async () => {
    const restoreEnv = mockProcessEnv({ PROMPT_AZURE_REALTIME_KEY: 'prompt-env-key' });
    vi.spyOn(AzureGenericProvider.prototype, 'getAccessToken').mockRejectedValue(
      new Error('Azure CLI is unavailable'),
    );
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com' },
    });

    try {
      await provider.callApi('hello', {
        prompt: {
          id: 'prompt-key-envar',
          config: { apiKeyEnvar: 'PROMPT_AZURE_REALTIME_KEY' },
        },
      } as any);
    } finally {
      restoreEnv();
    }

    const delegatedProvider = vi.mocked(OpenAiRealtimeProvider).mock.results[0]?.value;
    expect(delegatedProvider.config).toMatchObject({
      apiKey: 'prompt-env-key',
      headers: { 'api-key': 'prompt-env-key' },
    });
  });

  it('reconnects a persistent conversation when its endpoint or credentials change', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'base.openai.azure.com', apiKey: 'base-key' },
    });
    const context = {
      prompt: { id: 'prompt-a', config: {} },
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any;

    await provider.callApi('first turn', context);
    context.prompt.config = {
      apiHost: 'alternate.openai.azure.com',
      apiKey: 'alternate-key',
      headers: { 'x-tenant-id': 'tenant-b' },
    };
    await provider.callApi('second turn', context);

    expect(mockCleanup).toHaveBeenCalledOnce();
    expect(OpenAiRealtimeProvider).toHaveBeenCalledTimes(2);
    expect(vi.mocked(OpenAiRealtimeProvider).mock.results[1]?.value.config).toMatchObject({
      apiBaseUrl: 'https://alternate.openai.azure.com/openai/v1',
      apiKey: 'alternate-key',
      headers: { 'api-key': 'alternate-key', 'x-tenant-id': 'tenant-b' },
    });
  });
});
