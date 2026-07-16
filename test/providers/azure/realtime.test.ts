import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { AzureRealtimeProvider } from '../../../src/providers/azure/realtime';
import { OpenAiRealtimeProvider } from '../../../src/providers/openai/realtime';
import { mockProcessEnv } from '../../util/utils';

const { mockCallApi, mockCleanup } = vi.hoisted(() => ({
  mockCallApi: vi.fn(),
  mockCleanup: vi.fn(),
}));

vi.mock('../../../src/providers/openai/realtime', () => ({
  OpenAiRealtimeProvider: vi.fn().mockImplementation(function (_modelName, options) {
    return { config: options.config, callApi: mockCallApi, cleanup: mockCleanup };
  }),
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

  it('cleans up the delegated realtime connection', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await provider.callApi('hello');
    provider.cleanup();

    expect(mockCleanup).toHaveBeenCalledOnce();
  });

  it('preserves the realtime conversation-context default across calls', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime-1.5-2026-02-23', {
      config: { apiHost: 'example.openai.azure.com', apiKey: 'azure-key' },
    });

    await provider.callApi('hello');
    await provider.callApi('follow up', {
      test: { metadata: { conversationId: 'conversation-1' } },
    } as any);

    const delegatedProvider = vi.mocked(OpenAiRealtimeProvider).mock.results[0]?.value;
    expect(delegatedProvider.config.maintainContext).toBe(true);
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });
});
