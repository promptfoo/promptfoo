import cliState from '../../../src/cliState';
<<<<<<< HEAD
import { loadApiProviders } from '../../../src/providers';
import { getDefaultProviders } from '../../../src/providers/defaults';
=======
import { loadApiProviders } from '../../../src/providers/index';
>>>>>>> origin/main
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  getRedteamProvider,
  getTargetResponse,
  type Message,
  messagesToRedteamHistory,
  tryUnblocking,
} from '../../../src/redteam/providers/shared';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  Prompt,
  ProviderResponse,
} from '../../../src/types/index';
import { sleep } from '../../../src/util/time';

jest.mock('../../../src/util/time');
jest.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: {
    config: {
      redteam: {
        provider: undefined,
      },
    },
  },
}));
jest.mock('../../../src/providers/openai');
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn(),
}));
jest.mock('../../../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn().mockResolvedValue({}),
}));

const mockedSleep = jest.mocked(sleep);
const mockedLoadApiProviders = jest.mocked(loadApiProviders);
const mockedGetDefaultProviders = jest.mocked(getDefaultProviders);
const mockedOpenAiProvider = jest.mocked(OpenAiChatCompletionProvider);

describe('shared redteam provider utilities', () => {
  beforeEach(() => {
    // Clear all mocks thoroughly
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Reset specific mocks
    mockedSleep.mockClear();
    mockedLoadApiProviders.mockClear();
    mockedGetDefaultProviders.mockClear();
    mockedOpenAiProvider.mockClear();

    // Ensure defaults mock returns empty object (no redteam provider)
    mockedGetDefaultProviders.mockResolvedValue({} as any);

    // Clear the redteam provider manager cache
    // No cleanup needed - RedteamProviderManager is stateless

    // Reset cliState to default
    cliState.config = {
      redteam: {
        provider: undefined,
      },
    };

    // Reset OpenAI provider mock to default behavior
    mockedOpenAiProvider.mockImplementation((model: string, options?: any) => {
      const mockInstance = {
        id: () => `openai:${model}`,
        callApi: jest.fn(),
        toString: () => `OpenAI(${model})`,
        config: options?.config || {},
        getApiKey: jest.fn(),
        getApiUrl: jest.fn(),
        getApiUrlDefault: jest.fn(),
        getOrganization: jest.fn(),
        requiresApiKey: jest.fn(),
        initializationPromise: null,
        loadedFunctionCallbacks: {},
        mcpClient: null,
      };
      return mockInstance as any;
    });
  });

  describe('RedteamProviderManager', () => {
    const mockApiProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn<
        Promise<ProviderResponse>,
        [string, CallApiContextParams | undefined, any]
      >(),
    };

    it('uses hardcoded fallback when no provider is configured and defaults are empty', async () => {
      // Ensure getDefaultProviders returns no redteamProvider
      mockedGetDefaultProviders.mockResolvedValue({} as any);

      const result = await getRedteamProvider({});
      expect(result.id()).toContain('gpt-4.1-2025-04-14');
      expect((result as any).config.temperature).toBe(0.7);
    });

    it('uses the provider from the defaults system when available', async () => {
      const defaultProvider = {
        id: () => 'default-redteam-provider',
        callApi: jest.fn(),
        config: {},
      };
      mockedGetDefaultProviders.mockResolvedValue({ redteamProvider: defaultProvider } as any);

      const result = await getRedteamProvider({});
      expect(result.id()).toBe('default-redteam-provider');
    });

    // Note: Removed 'clears cached providers' test since RedteamProviderManager is now stateless

    it('loads provider from string identifier', async () => {
      mockedLoadApiProviders.mockResolvedValue([mockApiProvider]);

      const result = await getRedteamProvider({ provider: 'test-provider' });

      // Should return adapted provider with same id but with redteam config
      expect(result.id()).toBe('test-provider');
      expect(result.config).toEqual({ temperature: 0.7, response_format: { type: 'json_object' } });
      expect(mockedLoadApiProviders).toHaveBeenCalledWith(['test-provider']);
    });

    it('loads provider from provider options', async () => {
      const providerOptions = { id: 'test-provider', apiKey: 'test-key' };
      mockedLoadApiProviders.mockResolvedValue([mockApiProvider]);

      const result = await getRedteamProvider({ provider: providerOptions });

      // Should return adapted provider with same id but with redteam config
      expect(result.id()).toBe('test-provider');
      expect(result.config).toEqual({ temperature: 0.7, response_format: { type: 'json_object' } });
      expect(mockedLoadApiProviders).toHaveBeenCalledWith([providerOptions]);
    });

    it('sets response_format to json_object when enforceJson is true', async () => {
      const defaultConfig = { temperature: 0.5 };
      const defaultProvider = {
        id: () => 'default-json-provider',
        callApi: jest.fn(),
        config: defaultConfig,
      };
      mockedGetDefaultProviders.mockResolvedValue({ redteamProvider: defaultProvider } as any);

      const result = await getRedteamProvider({ enforceJson: true });

      // Check that the returned provider is a new object with modified config
      expect(result).not.toBe(defaultProvider);
      expect(result.id()).toBe('default-json-provider');
      expect((result as any).config.response_format).toEqual({ type: 'json_object' });
      expect((result as any).config.temperature).toBe(0.5); // Ensure original config is preserved
    });

    it('does not set response_format when enforceJson is false', async () => {
      const defaultConfig = { temperature: 0.5 };
      const defaultProvider = {
        id: () => 'default-no-json-provider',
        callApi: jest.fn(),
        config: defaultConfig,
      };
      mockedGetDefaultProviders.mockResolvedValue({ redteamProvider: defaultProvider } as any);

      const result = await getRedteamProvider({ enforceJson: false });

      // Check that the returned provider is a new object with modified config
      expect(result).not.toBe(defaultProvider);
      expect(result.id()).toBe('default-no-json-provider');
      expect((result as any).config.response_format).toBeUndefined();
      expect((result as any).config.temperature).toBe(0.5); // Ensure original config is preserved
    });

    it('uses provider from cliState if available', async () => {
      const mockStateProvider: ApiProvider = {
        id: () => 'state-provider',
        callApi: jest.fn<
          Promise<ProviderResponse>,
          [string, CallApiContextParams | undefined, any]
        >(),
      };

      // Clear and set up cliState for this test
      cliState.config = {
        redteam: {
          provider: mockStateProvider,
        },
      };

      const result = await getRedteamProvider({});

      // Should return adapted provider with same id but with redteam config
      expect(result.id()).toBe('state-provider');
      expect(result.config).toEqual({ temperature: 0.7, response_format: { type: 'json_object' } });

      // Clean up for next test
      cliState.config!.redteam!.provider = undefined;
    });

    it('loads providers with explicit configuration', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn<
          Promise<ProviderResponse>,
          [string, CallApiContextParams | undefined, any]
        >(),
      };
      mockedLoadApiProviders.mockResolvedValue([mockProvider]);

      // Get providers with explicit provider configuration
      const result = await getRedteamProvider({ provider: 'test-provider' });
      const jsonResult = await getRedteamProvider({
        provider: 'test-provider',
        enforceJson: true,
      });

      // Both should be adapted versions of the same base provider
      expect(result.id()).toBe('test-provider');
      expect(jsonResult.id()).toBe('test-provider');
      expect(mockedLoadApiProviders).toHaveBeenCalledTimes(2);
    });

    describe('getGradingProvider', () => {
      it('returns cached grading provider set via setGradingProvider', async () => {
        redteamProviderManager.clearProvider();
        const gradingInstance: ApiProvider = {
          id: () => 'grading-cached',
          callApi: jest.fn(),
        } as any;

        // Set concrete instance and retrieve it (jsonOnly false)
        await redteamProviderManager.setGradingProvider(gradingInstance as any);
        const got = await redteamProviderManager.getGradingProvider();
        expect(got.id()).toBe('grading-cached');
      });

      it('uses defaultTest chain when no cached grading provider', async () => {
        redteamProviderManager.clearProvider();
        const mockProvider: ApiProvider = {
          id: () => 'from-defaultTest-provider',
          callApi: jest.fn(),
        } as any;
        mockedLoadApiProviders.mockResolvedValue([mockProvider]);

        // Inject defaultTest provider config
        (cliState as any).config = {
          defaultTest: {
            provider: 'from-defaultTest-provider',
          },
        };

        const got = await redteamProviderManager.getGradingProvider();
        expect(got).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['from-defaultTest-provider']);
      });

      it('falls back to redteam provider when grading not set', async () => {
        redteamProviderManager.clearProvider();
        (cliState as any).config = {}; // no defaultTest

        // Expect fallback to default OpenAI redteam provider
        const got = await redteamProviderManager.getGradingProvider({ jsonOnly: true });
        expect(got.id()).toContain('openai:');
      });
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

    describe('Multilingual provider', () => {
      it('getMultilingualProvider returns undefined when not set', async () => {
        // Ensure clean state
        redteamProviderManager.clearProvider();
        const result = await redteamProviderManager.getMultilingualProvider();
        expect(result).toBeUndefined();
      });

      it('setMultilingualProvider caches provider and getMultilingualProvider returns it', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-multilingual-provider',
          callApi: jest.fn<
            Promise<ProviderResponse>,
            [string, CallApiContextParams | undefined, any]
          >(),
        };

        mockedLoadApiProviders.mockResolvedValueOnce([mockProvider]);

        await redteamProviderManager.setMultilingualProvider('test-multilingual-provider');
        const result = await redteamProviderManager.getMultilingualProvider();

        expect(result).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['test-multilingual-provider']);
      });

      it('setMultilingualProvider uses jsonOnly response_format when defaulting to OpenAI', async () => {
        const mockOpenAiInstance = {
          id: () => `openai:${ATTACKER_MODEL}`,
          callApi: jest.fn(),
          toString: () => `OpenAI(${ATTACKER_MODEL})`,
          config: { temperature: TEMPERATURE, response_format: { type: 'json_object' } },
          getApiKey: jest.fn(),
          getApiUrl: jest.fn(),
          getApiUrlDefault: jest.fn(),
          getOrganization: jest.fn(),
          requiresApiKey: jest.fn(),
          initializationPromise: null,
          loadedFunctionCallbacks: {},
          mcpClient: null,
        };

        mockedOpenAiProvider.mockClear();
        mockedOpenAiProvider.mockReturnValue(mockOpenAiInstance as any);

        // Pass undefined to trigger default provider creation
        await redteamProviderManager.setMultilingualProvider(undefined as any);

        expect(mockedOpenAiProvider).toHaveBeenCalledWith(ATTACKER_MODEL, {
          config: {
            temperature: TEMPERATURE,
            response_format: { type: 'json_object' },
          },
        });
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
        /Target returned malformed response: expected either `output` or `error` property to be set/,
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

    describe('edge cases for empty and falsy responses', () => {
      it('handles empty string output correctly', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              output: '', // Empty string
              tokenUsage: { numRequests: 1 },
            }),
        };

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: '',
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles zero output correctly', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              output: 0, // Zero value
              tokenUsage: { numRequests: 1 },
            }),
        };

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: '0', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles false output correctly', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              output: false, // Boolean false
              tokenUsage: { numRequests: 1 },
            }),
        };

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: 'false', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles null output correctly', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              output: null, // Null value
              tokenUsage: { numRequests: 1 },
            }),
        };

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: 'null', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('still fails when output property is missing', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              // No output property at all
              tokenUsage: { numRequests: 1 },
            }),
        };

        await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
          /Target returned malformed response: expected either `output` or `error` property to be set/,
        );
      });

      it('still fails when both output and error are missing', async () => {
        const mockProvider: ApiProvider = {
          id: () => 'test-provider',
          callApi: jest
            .fn<Promise<ProviderResponse>, [string, CallApiContextParams | undefined, any]>()
            .mockResolvedValue({
              someOtherField: 'value',
            } as any),
        };

        await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
          /Target returned malformed response/,
        );
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

  // New tests for tryUnblocking env flag
  describe('tryUnblocking environment flag', () => {
    const originalEnv = process.env.PROMPTFOO_ENABLE_UNBLOCKING;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PROMPTFOO_ENABLE_UNBLOCKING;
      } else {
        process.env.PROMPTFOO_ENABLE_UNBLOCKING = originalEnv;
      }
    });

    it('short-circuits by default when PROMPTFOO_ENABLE_UNBLOCKING is not set', async () => {
      delete process.env.PROMPTFOO_ENABLE_UNBLOCKING;

      const result = await tryUnblocking({
        messages: [],
        lastResponse: 'irrelevant',
        goal: 'test-goal',
        purpose: 'test-purpose',
      });

      expect(result.success).toBe(false);
      expect(result.unblockingPrompt).toBeUndefined();
    });

    it('does not short-circuit when PROMPTFOO_ENABLE_UNBLOCKING=true', async () => {
      process.env.PROMPTFOO_ENABLE_UNBLOCKING = 'true';

      // Spy on logger to verify we don't see the "disabled by default" message
      const loggerSpy = jest.spyOn(require('../../../src/logger').default, 'debug');

      const result = await tryUnblocking({
        messages: [],
        lastResponse: 'What industry are you in?',
        goal: 'test-goal',
        purpose: 'test-purpose',
      });

      // Verify we did NOT log the "disabled by default" message
      expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Disabled by default'));

      // The function should still return false (because server feature check will fail in test env)
      // but for a different reason than the env var check
      expect(result.success).toBe(false);

      loggerSpy.mockRestore();
    });
  });
});
