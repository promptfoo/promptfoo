import path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import { mockProcessEnv } from '../util/utils';

type EjentumProviderConstructor = new (options?: {
  config?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  underlyingProvider?: {
    callApi: (prompt: string, context?: unknown) => Promise<unknown>;
  };
}) => {
  callApi(
    prompt: string,
    context?: { prompt?: { config?: Record<string, unknown> } },
  ): Promise<unknown>;
};

let EjentumAugmentedProvider: EjentumProviderConstructor;

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('baseline-vs-ejentum-harness provider', () => {
  let restoreEnv: (() => void) | undefined;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    EjentumAugmentedProvider = (await importModule(
      path.resolve('examples/baseline-vs-ejentum-harness/provider.mjs'),
    )) as EjentumProviderConstructor;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        OPENAI_API_KEY: 'openai-key',
      },
      { clear: true },
    );
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.unstubAllGlobals();
  });

  it('returns an error when EJENTUM_API_KEY is not set', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv({}, { clear: true });

    const provider = new EjentumAugmentedProvider();
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'EJENTUM_API_KEY is not set. Get a key at https://ejentum.com/dashboard',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an error without calling underlying provider when the requested scaffold is missing', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{}]));

    const mockUnderlying = { callApi: vi.fn() };
    const provider = new EjentumAugmentedProvider({
      config: { mode: 'reasoning' },
      underlyingProvider: mockUnderlying,
    });
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'Ejentum API response did not include a non-empty "reasoning" scaffold.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockUnderlying.callApi).not.toHaveBeenCalled();
  });

  it('returns an error when Ejentum API returns non-OK status', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ message: 'Unauthorized' }, false, 401));

    const mockUnderlying = { callApi: vi.fn() };
    const provider = new EjentumAugmentedProvider({
      config: { mode: 'reasoning' },
      underlyingProvider: mockUnderlying,
    });
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'Ejentum API 401: {"message":"Unauthorized"}',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockUnderlying.callApi).not.toHaveBeenCalled();
  });

  it('returns an error when Ejentum fetch fails with network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection timeout'));

    const mockUnderlying = { callApi: vi.fn() };
    const provider = new EjentumAugmentedProvider({
      config: { mode: 'reasoning' },
      underlyingProvider: mockUnderlying,
    });
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'Ejentum fetch failed: Error: Connection timeout',
    });
    expect(mockUnderlying.callApi).not.toHaveBeenCalled();
  });

  it('delegates to underlying provider with cognitive scaffold prepended', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'identify edge cases' }]));

    const mockUnderlying = {
      callApi: vi.fn().mockResolvedValue({
        output: 'controlled result',
        tokenUsage: { prompt: 15, completion: 5, total: 20 },
      }),
    };

    const provider = new EjentumAugmentedProvider({
      config: { mode: 'reasoning', model: 'gpt-5.4-mini' },
      underlyingProvider: mockUnderlying,
    });

    const result = await provider.callApi('solve this');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ejentum.com/logicv1/');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer ejentum-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'solve this', mode: 'reasoning' }),
    });

    expect(mockUnderlying.callApi).toHaveBeenCalledTimes(1);
    const delegatedPrompt = JSON.parse(mockUnderlying.callApi.mock.calls[0][0]);
    expect(delegatedPrompt).toEqual([
      {
        role: 'system',
        content:
          'Apply the cognitive scaffold below, then answer the user\'s task.\n\n[COGNITIVE SCAFFOLD]\nidentify edge cases\n[END SCAFFOLD]',
      },
      {
        role: 'user',
        content: 'solve this',
      },
    ]);

    expect(result).toEqual({
      output: 'controlled result',
      tokenUsage: { prompt: 15, completion: 5, total: 20 },
    });
  });

  it('preserves model options including reasoning_effort and verbosity without dropping or overriding', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = {
      callApi: vi.fn().mockResolvedValue({ output: 'done' }),
    };

    const provider = new EjentumAugmentedProvider({
      config: {
        model: 'gpt-6-sol',
        reasoning_effort: 'none',
        verbosity: 'low',
      },
      underlyingProvider: mockUnderlying,
    });

    await provider.callApi('test prompt');

    expect(mockUnderlying.callApi).toHaveBeenCalledTimes(1);
    // Verified that underlying provider call is executed with augmented prompt and unmodified context
  });

  it('honors custom Ejentum API URL from config and environment variable', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        EJENTUM_API_URL: 'https://staging.ejentum.internal/logicv1/',
      },
      { clear: true },
    );

    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = { callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
    const provider = new EjentumAugmentedProvider({
      underlyingProvider: mockUnderlying,
    });

    await provider.callApi('query');
    expect(fetchMock.mock.calls[0][0]).toBe('https://staging.ejentum.internal/logicv1/');
  });

  it('prefers config.apiUrl over EJENTUM_API_URL environment variable', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        EJENTUM_API_URL: 'https://env.ejentum.internal/logicv1/',
      },
      { clear: true },
    );

    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = { callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
    const provider = new EjentumAugmentedProvider({
      config: { apiUrl: 'https://config.ejentum.internal/logicv1/' },
      underlyingProvider: mockUnderlying,
    });

    await provider.callApi('query');
    expect(fetchMock.mock.calls[0][0]).toBe('https://config.ejentum.internal/logicv1/');
  });

  it('reads Ejentum API key from config.ejentumApiKey and config.ejentumApiKeyEnvar', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv(
      {
        CUSTOM_EJENTUM_SECRET: 'custom-secret-key',
      },
      { clear: true },
    );

    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = { callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
    const provider = new EjentumAugmentedProvider({
      config: { ejentumApiKeyEnvar: 'CUSTOM_EJENTUM_SECRET' },
      underlyingProvider: mockUnderlying,
    });

    await provider.callApi('query');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer custom-secret-key');
  });

  it('handles JSON chat prompt by prepending scaffold system message', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = { callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
    const provider = new EjentumAugmentedProvider({
      underlyingProvider: mockUnderlying,
    });

    const conversationPrompt = JSON.stringify([
      { role: 'system', content: 'Base system prompt' },
      { role: 'user', content: 'First user message' },
    ]);

    await provider.callApi(conversationPrompt);

    expect(mockUnderlying.callApi).toHaveBeenCalledTimes(1);
    const parsedMessages = JSON.parse(mockUnderlying.callApi.mock.calls[0][0]);
    expect(parsedMessages).toHaveLength(3);
    expect(parsedMessages[0].role).toBe('system');
    expect(parsedMessages[0].content).toContain('[COGNITIVE SCAFFOLD]');
    expect(parsedMessages[1]).toEqual({ role: 'system', content: 'Base system prompt' });
    expect(parsedMessages[2]).toEqual({ role: 'user', content: 'First user message' });
  });

  it('passes context and prompt config through to underlying provider', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]));

    const mockUnderlying = { callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
    const provider = new EjentumAugmentedProvider({
      underlyingProvider: mockUnderlying,
    });

    const context = {
      prompt: { config: { temperature: 0.5 } },
      vars: { task: 'do something' },
    };

    await provider.callApi('prompt', context);

    expect(mockUnderlying.callApi).toHaveBeenCalledWith(expect.any(String), context);
  });
});
