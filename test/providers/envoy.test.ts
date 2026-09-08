import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { createEnvoyProvider } from '../../src/providers/envoy';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Envoy gateway URLs', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      ENVOY_API_BASE_URL: 'https://env.example/v1/',
      OPENAI_API_KEY: 'test-envoy-key',
      OPENAI_ORGANIZATION: undefined,
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    restoreEnv();
  });

  it.each([
    'https://gateway.example',
    'https://gateway.example/',
    'https://gateway.example//',
    'https://gateway.example/v1',
    'https://gateway.example/v1/',
    'https://gateway.example/v1//',
  ])('uses one /v1 path for environment URL %s', async (url) => {
    mockProcessEnv({ ENVOY_API_BASE_URL: url });
    const provider = createEnvoyProvider('envoy:route:stable');

    const response = await provider.callApi('Hello');

    expect(response.output).toBe('Hello');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(requestUrl).toBe('https://gateway.example/v1/chat/completions');
    expect(JSON.parse(request.body as string)).toMatchObject({ model: 'route:stable' });
  });

  it.each([
    ['https://configured.example', 'https://configured.example/chat/completions'],
    ['https://configured.example/v1/', 'https://configured.example/v1/chat/completions'],
    ['https://configured.example/custom/', 'https://configured.example/custom/chat/completions'],
  ])('preserves explicit URL %s over the environment', async (apiBaseUrl, expectedUrl) => {
    const provider = createEnvoyProvider('envoy:route:stable', {
      id: 'custom-id',
      config: {
        config: {
          apiBaseUrl,
          headers: { 'X-Gateway': 'configured' },
          temperature: 0.25,
        },
      },
    });

    const response = await provider.callApi('Hello');

    expect(response.output).toBe('Hello');
    expect(provider.id()).toBe('custom-id');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(requestUrl).toBe(expectedUrl);
    expect(request.headers).toMatchObject({ 'X-Gateway': 'configured' });
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: 'route:stable',
      temperature: 0.25,
    });
  });
});
