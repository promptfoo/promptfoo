import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import { OpenAiGenericProvider } from '../../src/providers/openai';
import { createTogetherAiProvider } from '../../src/providers/togetherai';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithCache)
    .mockReset()
    .mockResolvedValue({
      data: {
        choices: [
          { text: 'fixture output', message: { content: 'fixture output' }, finish_reason: 'stop' },
        ],
        data: [{ embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
});
afterEach(() => vi.restoreAllMocks());

describe.each(['chat', 'completion', 'embedding'])('TogetherAI %s connection policy', (type) => {
  it('keeps connection and runtime settings out of the model body', async () => {
    const provider = createTogetherAiProvider(`togetherai:${type}:fixture-model`, {
      config: {
        id: 'custom-provider',
        config: {
          apiBaseUrl: 'http://fixture.invalid/v1',
          apiKey: 'configured-key',
          headers: { 'X-Fixture': 'header-value' },
          cost: 0.01,
          basePath: '/fixture/config',
          linkedTargetId: 'fixture-target',
          maxRetries: 0,
          mcp: { enabled: false },
          functionToolCallbacks: { example: () => 'result' },
          temperature: 0.25,
          repetition_penalty: 1.1,
          passthrough: { custom_field: 'value', temperature: 0.5 },
        },
      },
    });
    const response =
      type === 'embedding'
        ? await provider.callEmbeddingApi!('fixture prompt')
        : await provider.callApi('fixture prompt');
    expect(response.error).toBeUndefined();
    expect(provider.id()).toBe('custom-provider');
    const [url, request, , , , retries] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(
      `http://fixture.invalid/v1/${type === 'chat' ? 'chat/completions' : type === 'completion' ? 'completions' : 'embeddings'}`,
    );
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer configured-key',
      'X-Fixture': 'header-value',
    });
    expect(retries).toBe(0);
    const body = JSON.parse(request?.body as string);
    expect(body).toMatchObject({
      temperature: 0.5,
      repetition_penalty: 1.1,
      custom_field: 'value',
    });
    for (const key of [
      'apiKey',
      'basePath',
      'linkedTargetId',
      'apiBaseUrl',
      'apiKeyEnvar',
      'headers',
      'cost',
      'maxRetries',
      'mcp',
      'functionToolCallbacks',
      'passthrough',
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });
});

describe.each([
  ['OpenAI', OpenAiGenericProvider],
  ['Azure', AzureGenericProvider],
] as const)('%s named credential precedence', (_name, Provider) => {
  it('uses the provider environment before the process environment', async () => {
    mockProcessEnv({ TOGETHER_API_KEY: 'process-key' });
    const provider = new Provider('fixture-model', {
      config: { apiKeyEnvar: 'TOGETHER_API_KEY' },
      env: { TOGETHER_API_KEY: 'provider-key' },
    });
    expect(provider.getApiKey()).toBe('provider-key');
    if (provider instanceof AzureGenericProvider) {
      await provider.ensureInitialized();
    }
  });
});

it('preserves the normalized provider environment over the factory context', () => {
  const provider = createTogetherAiProvider('togetherai:chat:fixture-model', {
    env: { TOGETHER_API_KEY: 'context-key' },
    config: { env: { TOGETHER_API_KEY: 'provider-key' } },
  }) as OpenAiGenericProvider;
  expect(provider.getApiKey()).toBe('provider-key');
});
