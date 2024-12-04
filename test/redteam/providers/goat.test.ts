import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import type {
  ApiProvider,
  CallApiContextParams,
  Prompt,
  ProviderResponse,
} from '../../../src/types';

jest.mock('../../../src/logger');

describe('RedteamGoatProvider', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn().mockImplementation(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with required config', () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
    });

    expect(provider.id()).toBe('promptfoo:redteam:goat');
  });

  it('should throw error if injectVar is missing', () => {
    expect(() => {
      new RedteamGoatProvider({});
    }).toThrow('Expected injectVar to be set');
  });

  it('should make correct API calls with message history', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
    });

    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: async () =>
        Promise.resolve({
          output: 'target response',
          tokenUsage: {},
        }) as ProviderResponse,
    };

    const prompt: Prompt = {
      raw: 'test prompt',
      label: 'test',
    };

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt,
    };

    await provider.callApi('test prompt', context);

    expect(mockFetch).toHaveBeenCalledWith(
      getRemoteGenerationUrl(),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.any(String),
      }),
    );
  });

  it('should stringify non-string target provider responses', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const objectResponse = { foo: 'bar', baz: 123 };
    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: async () =>
        Promise.resolve({
          output: objectResponse,
          tokenUsage: {},
        }) as ProviderResponse,
    };

    const prompt: Prompt = {
      raw: 'test prompt',
      label: 'test',
    };

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt,
    };

    const result = await provider.callApi('test prompt', context);
    const messages = JSON.parse(result.metadata?.messages);
    expect(messages[messages.length - 1].content).toBe(JSON.stringify(objectResponse));
  });
});
