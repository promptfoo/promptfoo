import cliState from '../../../src/cliState';
import { loadApiProviders } from '../../../src/providers';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  ATTACKER_MODEL,
  ATTACKER_MODEL_SMALL,
  TEMPERATURE,
} from '../../../src/redteam/providers/constants';
import {
  redteamProviderManager,
  getTargetResponse,
  messagesToRedteamHistory,
  type Message,
} from '../../../src/redteam/providers/shared';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  Prompt,
  ProviderResponse,
} from '../../../src/types';
import { sleep } from '../../../src/util/time';

jest.mock('../../../src/util/time');
jest.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: {
    config: {
      redteam: {
        provider: null,
      },
    },
  },
}));
jest.mock('../../../src/providers/openai');
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn(),
}));

const mockedSleep = jest.mocked(sleep);
const mockedLoadApiProviders = jest.mocked(loadApiProviders);
const mockedOpenAiProvider = jest.mocked(OpenAiChatCompletionProvider);

describe('shared redteam provider utilities', () => {
  beforeEach(() => {
    mockedSleep.mockClear();
    mockedLoadApiProviders.mockClear();
    mockedOpenAiProvider.mockClear();
    redteamProviderManager.clearProvider();
  });

  describe('RedteamProviderManager', () => {
    const mockApiProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn<
        Promise<ProviderResponse>,
        [string, CallApiContextParams | undefined, any]
      >(),
    };

    it('creates default OpenAI provider when no provider specified', async () => {
      const mockOpenAiInstance = new OpenAiChatCompletionProvider(ATTACKER_MODEL);
      mockedOpenAiProvider.mockReturnValue(mockOpenAiInstance);

      const result = await redteamProviderManager.getProvider({});

      expect(result).toBe(mockOpenAiInstance);
      expect(mockedOpenAiProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
        config: {
          temperature: TEMPERATURE,
          response_format: undefined,
        },
      });
    });

    it('clears cached providers', async () => {
      const mockOpenAiInstance = new OpenAiChatCompletionProvider(ATTACKER_MODEL);
      mockedOpenAiProvider.mockReturnValue(mockOpenAiInstance);

      // First call to set up the cache
      await redteamProviderManager.getProvider({});

      // Clear the cache
      redteamProviderManager.clearProvider();
      mockedOpenAiProvider.mockClear();

      // Second call should create a new provider
      await redteamProviderManager.getProvider({});

      expect(mockedOpenAiProvider).toHaveBeenCalledTimes(1);
    });

    it('loads provider from string identifier', async () => {
      mockedLoadApiProviders.mockResolvedValue([mockApiProvider]);

      const result = await redteamProviderManager.getProvider({ provider: 'test-provider' });

      expect(result).toBe(mockApiProvider);
      expect(mockedLoadApiProviders).toHaveBeenCalledWith(['test-provider']);
    });

    it('loads provider from provider options', async () => {
      const providerOptions = { id: 'test-provider', apiKey: 'test-key' };
      mockedLoadApiProviders.mockResolvedValue([mockApiProvider]);

      const result = await redteamProviderManager.getProvider({ provider: providerOptions });

      expect(result).toBe(mockApiProvider);
      expect(mockedLoadApiProviders).toHaveBeenCalledWith([providerOptions]);
    });

    it('uses small model when preferSmallModel is true', async () => {
      const mockOpenAiInstance = new OpenAiChatCompletionProvider(ATTACKER_MODEL_SMALL);
      mockedOpenAiProvider.mockReturnValue(mockOpenAiInstance);

      const result = await redteamProviderManager.getProvider({ preferSmallModel: true });

      expect(result).toBe(mockOpenAiInstance);
      expect(mockedOpenAiProvider).toHaveBeenCalledWith(ATTACKER_MODEL_SMALL, {
        config: {
          temperature: TEMPERATURE,
          response_format: undefined,
        },
      });
    });

    it('sets response_format to json_object when jsonOnly is true', async () => {
      const mockOpenAiInstance = new OpenAiChatCompletionProvider(ATTACKER_MODEL);
      mockedOpenAiProvider.mockReturnValue(mockOpenAiInstance);

      const result = await redteamProviderManager.getProvider({ jsonOnly: true });

      expect(result).toBe(mockOpenAiInstance);
      expect(mockedOpenAiProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
        config: {
          temperature: TEMPERATURE,
          response_format: { type: 'json_object' },
        },
      });
    });

    it('uses provider from cliState if available', async () => {
      const mockStateProvider: ApiProvider = {
        id: () => 'state-provider',
        callApi: jest.fn<
          Promise<ProviderResponse>,
          [string, CallApiContextParams | undefined, any]
        >(),
      };
      cliState.config!.redteam!.provider = mockStateProvider;

      const result = await redteamProviderManager.getProvider({});

      expect(result).toBe(mockStateProvider);
    });

    it('sets and reuses providers', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn<
          Promise<ProviderResponse>,
          [string, CallApiContextParams | undefined, any]
        >(),
      };
      mockedLoadApiProviders.mockResolvedValue([mockProvider]);

      // Set the provider
      await redteamProviderManager.setProvider('test-provider');

      // Get the provider - should use cached version
      const result = await redteamProviderManager.getProvider({});
      const jsonResult = await redteamProviderManager.getProvider({ jsonOnly: true });

      expect(result).toBe(mockProvider);
      expect(jsonResult).toBe(mockProvider);
      expect(mockedLoadApiProviders).toHaveBeenCalledTimes(2); // Once for regular, once for jsonOnly
    });

    it('handles thrown errors in getTargetResponse', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockRejectedValue(new Error('Network error')),
      };

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '',
        error: 'Network error',
        tokenUsage: { numRequests: 1 },
      });
    });
  });

  describe('getTargetResponse', () => {
    it('returns successful response with string output', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            output: 'test response',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
            sessionId: 'test-session',
          }),
      };

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: 'test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
        sessionId: 'test-session',
      });
    });

    it('passes through context and options', async () => {
      const mockCallApi = jest
        .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
        .mockResolvedValue({
          output: 'test response',
          tokenUsage: { numRequests: 1 },
        });

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: mockCallApi,
      };

      const prompt: Prompt = {
        raw: 'test prompt',
        label: 'test',
      };

      const context: CallApiContextParams = {
        prompt,
        vars: { test: 'value' },
      };
      const options: CallApiOptionsParams = {};

      await getTargetResponse(mockProvider, 'test prompt', context, options);

      expect(mockCallApi).toHaveBeenCalledWith('test prompt', context, options);
    });

    it('stringifies non-string output', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            output: { key: 'value' },
            tokenUsage: { numRequests: 1 },
          }),
      };

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '{"key":"value"}',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('handles provider error response', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            error: 'API error',
            sessionId: 'error-session',
          }),
      };

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '',
        error: 'API error',
        sessionId: 'error-session',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('respects provider delay for non-cached responses', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        delay: 100,
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            output: 'test response',
            tokenUsage: { numRequests: 1 },
          }),
      };

      await getTargetResponse(mockProvider, 'test prompt');

      expect(mockedSleep).toHaveBeenCalledWith(100);
    });

    it('skips delay for cached responses', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        delay: 100,
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            output: 'test response',
            cached: true,
            tokenUsage: { numRequests: 1 },
          }),
      };

      await getTargetResponse(mockProvider, 'test prompt');

      expect(mockedSleep).not.toHaveBeenCalled();
    });

    it('throws error when neither output nor error is set', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({}),
      };

      await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
        'Expected target output or error to be set',
      );
    });

    it('uses default tokenUsage when not provided', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest
          .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
          .mockResolvedValue({
            output: 'test response',
          }),
      };

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: 'test response',
        tokenUsage: { numRequests: 1 },
      });
    });
  });

  describe('messagesToRedteamHistory', () => {
    it('converts valid messages to redteamHistory format', () => {
      const messages: Message[] = [
        { role: 'system', content: 'system message' },
        { role: 'user', content: 'user message 1' },
        { role: 'assistant', content: 'assistant response 1' },
        { role: 'user', content: 'user message 2' },
        { role: 'assistant', content: 'assistant response 2' },
      ];

      const result = messagesToRedteamHistory(messages);

      expect(result).toEqual([
        { prompt: 'user message 1', output: 'assistant response 1' },
        { prompt: 'user message 2', output: 'assistant response 2' },
      ]);
    });

    it('handles empty messages array', () => {
      const messages: Message[] = [];
      const result = messagesToRedteamHistory(messages);
      expect(result).toEqual([]);
    });

    it('handles messages with missing content', () => {
      const messages: Message[] = [
        { role: 'user', content: '' },
        { role: 'assistant', content: undefined as any },
        { role: 'user', content: 'valid message' },
        { role: 'assistant', content: 'valid response' },
      ];

      const result = messagesToRedteamHistory(messages);

      expect(result).toEqual([
        { prompt: '', output: '' },
        { prompt: 'valid message', output: 'valid response' },
      ]);
    });

    it('handles malformed messages gracefully', () => {
      const messages = [
        { wrong: 'format' },
        null,
        undefined,
        { role: 'user', content: 'valid message' },
        { role: 'assistant', content: 'valid response' },
      ] as Message[];

      const result = messagesToRedteamHistory(messages);

      expect(result).toEqual([{ prompt: 'valid message', output: 'valid response' }]);
    });

    it('handles non-array input gracefully', () => {
      const result = messagesToRedteamHistory(null as any);
      expect(result).toEqual([]);
    });

    it('skips incomplete message pairs', () => {
      const messages: Message[] = [
        { role: 'user', content: 'user message 1' },
        { role: 'user', content: 'user message 2' },
        { role: 'assistant', content: 'assistant response 2' },
      ];

      const result = messagesToRedteamHistory(messages);

      expect(result).toEqual([{ prompt: 'user message 2', output: 'assistant response 2' }]);
    });
  });
});
