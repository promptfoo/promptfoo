import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import {
  ATTACKER_MODEL,
  ATTACKER_MODEL_SMALL,
  TEMPERATURE,
} from '../../../src/redteam/providers/constants';
import {
  BLOCKING_QUESTION_ANALYSIS_FEATURE_FLAG_TIMESTAMP,
  buildGraderResultAssertion,
  formatRedteamHistoryAsTranscript,
  getGraderAssertionValue,
  getTargetResponse,
  type Message,
  messagesToRedteamHistory,
  redteamProviderManager,
  tryUnblocking,
} from '../../../src/redteam/providers/shared';
import { sleep } from '../../../src/util/time';
import { createMockProvider } from '../../factories/provider';

import type {
  ApiProvider,
  Assertion,
  AssertionSet,
  CallApiContextParams,
  CallApiOptionsParams,
  Prompt,
} from '../../../src/types/index';

// Hoisted mocks for class constructor and loadApiProviders
const mockLoadApiProviders = vi.hoisted(() => vi.fn());
const mockCheckServerFeatureSupport = vi.hoisted(() => vi.fn());
// Create a hoisted mock class that can be instantiated with `new`
const mockOpenAiInstances: any[] = [];
const MockOpenAiChatCompletionProvider = vi.hoisted(() => {
  return class MockOpenAiChatCompletionProvider {
    id: () => string;
    callApi: any;
    toString: () => string;
    config: any;
    getApiKey: any;
    getApiUrl: any;
    getApiUrlDefault: any;
    getOrganization: any;
    requiresApiKey: any;
    initializationPromise: null;
    loadedFunctionCallbacks: {};
    mcpClient: null;

    constructor(model: string, options?: any) {
      this.id = () => `openai:${model}`;
      this.callApi = vi.fn();
      this.toString = () => `OpenAI(${model})`;
      this.config = options?.config || {};
      this.getApiKey = vi.fn();
      this.getApiUrl = vi.fn();
      this.getApiUrlDefault = vi.fn();
      this.getOrganization = vi.fn();
      this.requiresApiKey = vi.fn();
      this.initializationPromise = null;
      this.loadedFunctionCallbacks = {};
      this.mcpClient = null;
      mockOpenAiInstances.push(this);
    }

    static mock: ReturnType<typeof vi.fn> = vi.fn();
  };
});

vi.mock('../../../src/util/time');
vi.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: {
    config: {
      redteam: {
        provider: undefined,
      },
    },
  },
}));
vi.mock('../../../src/providers/openai/chat', () => ({
  OpenAiChatCompletionProvider: MockOpenAiChatCompletionProvider,
}));
vi.mock('../../../src/providers/index', () => ({
  loadApiProviders: mockLoadApiProviders,
}));
vi.mock('../../../src/util/server', () => ({
  checkServerFeatureSupport: mockCheckServerFeatureSupport,
}));

const mockedSleep = vi.mocked(sleep);
const mockedLoadApiProviders = mockLoadApiProviders;
const mockedCheckServerFeatureSupport = mockCheckServerFeatureSupport;

function setCliStateConfig(config: typeof cliState.config) {
  cliState.config = config;
}

describe('shared redteam provider utilities', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  beforeEach(() => {
    // Clear all mocks thoroughly
    vi.clearAllMocks();

    // Reset specific mocks
    mockedSleep.mockReset();
    mockedLoadApiProviders.mockReset();
    mockedCheckServerFeatureSupport.mockReset();

    // Clear the instances array
    mockOpenAiInstances.length = 0;

    // Clear the redteam provider manager cache
    redteamProviderManager.clearProvider();

    // Reset cliState to default
    setCliStateConfig({
      redteam: {
        provider: undefined,
      },
    });
  });

  describe('RedteamProviderManager', () => {
    const mockApiProvider = createMockProvider({ response: { output: 'test output' } });

    it('creates default OpenAI provider when no provider specified', async () => {
      const result = await redteamProviderManager.getProvider({});

      // Check that an instance was created with the correct parameters
      expect(mockOpenAiInstances.length).toBe(1);
      expect(result.id()).toBe(`openai:${ATTACKER_MODEL}`);
      expect(mockOpenAiInstances[0].config).toEqual({
        temperature: TEMPERATURE,
        response_format: undefined,
      });
    });

    it('clears cached providers', async () => {
      // First call to set up the cache
      await redteamProviderManager.getProvider({});
      expect(mockOpenAiInstances.length).toBe(1);

      // Clear the cache and instances array
      redteamProviderManager.clearProvider();
      mockOpenAiInstances.length = 0;

      // Second call should create a new provider
      await redteamProviderManager.getProvider({});

      expect(mockOpenAiInstances.length).toBe(1);
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
      const result = await redteamProviderManager.getProvider({ preferSmallModel: true });

      // Check that an instance was created with the small model
      expect(mockOpenAiInstances.length).toBe(1);
      expect(result.id()).toBe(`openai:${ATTACKER_MODEL_SMALL}`);
      expect(mockOpenAiInstances[0].config).toEqual({
        temperature: TEMPERATURE,
        response_format: undefined,
      });
    });

    it('sets response_format to json_object when jsonOnly is true', async () => {
      const result = await redteamProviderManager.getProvider({ jsonOnly: true });

      // Check that an instance was created with json_object response_format
      expect(mockOpenAiInstances.length).toBe(1);
      expect(result.id()).toBe(`openai:${ATTACKER_MODEL}`);
      expect(mockOpenAiInstances[0].config).toEqual({
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      });
    });

    it('uses provider from cliState if available', async () => {
      const mockStateProvider = createMockProvider({ id: 'state-provider' });

      // Clear and set up cliState for this test
      setCliStateConfig({
        redteam: {
          provider: mockStateProvider,
        },
      });

      const result = await redteamProviderManager.getProvider({});

      expect(result).toBe(mockStateProvider);
    });

    it('sets and reuses providers', async () => {
      const mockProvider = createMockProvider({ response: { output: 'test output' } });
      mockedLoadApiProviders.mockResolvedValue([mockProvider]);

      // Set the provider
      await redteamProviderManager.setProvider('test-provider');

      // Get the provider - should use cached version
      const result = await redteamProviderManager.getProvider({});
      const jsonResult = await redteamProviderManager.getProvider({ jsonOnly: true });

      expect(result).toBe(mockProvider);
      expect(jsonResult).toBe(mockProvider);
      expect(mockedLoadApiProviders).toHaveBeenCalledTimes(2); // Preloads regular and jsonOnly caches
      expect(mockedLoadApiProviders).toHaveBeenNthCalledWith(1, ['test-provider']);
      expect(mockedLoadApiProviders).toHaveBeenNthCalledWith(2, ['test-provider']);
    });

    describe('getGradingProvider', () => {
      it('returns cached grading provider set via setGradingProvider', async () => {
        redteamProviderManager.clearProvider();
        const gradingInstance = createMockProvider({ id: 'grading-cached' });

        // Set concrete instance and retrieve it (jsonOnly false)
        await redteamProviderManager.setGradingProvider(gradingInstance as any);
        const got = await redteamProviderManager.getGradingProvider();
        expect(got.id()).toBe('grading-cached');
      });

      it('uses defaultTest chain when no cached grading provider', async () => {
        redteamProviderManager.clearProvider();
        const mockProvider = createMockProvider({ id: 'from-defaultTest-provider' });
        mockedLoadApiProviders.mockResolvedValue([mockProvider]);

        // Inject defaultTest provider config
        setCliStateConfig({
          defaultTest: {
            provider: 'from-defaultTest-provider',
          },
        });

        const got = await redteamProviderManager.getGradingProvider();
        expect(got).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['from-defaultTest-provider']);
      });

      it('falls back to redteam provider when grading not set', async () => {
        redteamProviderManager.clearProvider();
        setCliStateConfig({}); // no defaultTest

        // Expect fallback to default OpenAI redteam provider
        const got = await redteamProviderManager.getGradingProvider({ jsonOnly: true });
        expect(got.id()).toContain('openai:');
      });
    });

    describe('getProvider with defaultTest fallback', () => {
      afterEach(() => {
        vi.resetAllMocks();
      });

      it('uses defaultTest.options.provider when no redteam.provider is set', async () => {
        redteamProviderManager.clearProvider();
        const mockProvider = createMockProvider({ id: 'defaultTest-provider' });
        mockedLoadApiProviders.mockResolvedValue([mockProvider]);

        // Set defaultTest.options.provider but not redteam.provider
        setCliStateConfig({
          redteam: {
            provider: undefined,
          },
          defaultTest: {
            options: {
              provider: 'defaultTest-provider',
            },
          },
        });

        const got = await redteamProviderManager.getProvider({});
        expect(got).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['defaultTest-provider']);
      });

      it('uses defaultTest.provider when no redteam.provider is set', async () => {
        redteamProviderManager.clearProvider();
        const mockProvider = createMockProvider({ id: 'defaultTest-direct-provider' });
        mockedLoadApiProviders.mockResolvedValue([mockProvider]);

        // Set defaultTest.provider directly
        setCliStateConfig({
          redteam: {
            provider: undefined,
          },
          defaultTest: {
            provider: 'defaultTest-direct-provider',
          },
        });

        const got = await redteamProviderManager.getProvider({});
        expect(got).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['defaultTest-direct-provider']);
      });

      it('prefers redteam.provider over defaultTest provider', async () => {
        redteamProviderManager.clearProvider();
        const redteamProvider = createMockProvider({ id: 'redteam-explicit-provider' });
        mockedLoadApiProviders.mockResolvedValue([redteamProvider]);

        // Set both redteam.provider and defaultTest.options.provider
        setCliStateConfig({
          redteam: {
            provider: 'redteam-explicit-provider',
          },
          defaultTest: {
            options: {
              provider: 'defaultTest-provider',
            },
          },
        });

        const got = await redteamProviderManager.getProvider({});
        expect(got).toBe(redteamProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['redteam-explicit-provider']);
      });

      it('falls back to OpenAI default when neither redteam.provider nor defaultTest provider is set', async () => {
        redteamProviderManager.clearProvider();
        mockOpenAiInstances.length = 0;

        setCliStateConfig({
          redteam: {
            provider: undefined,
          },
          // No defaultTest
        });

        const got = await redteamProviderManager.getProvider({});
        expect(got.id()).toContain('openai:');
        expect(mockOpenAiInstances.length).toBe(1);
      });
    });

    it('handles thrown errors in getTargetResponse', async () => {
      const mockProvider = createMockProvider({
        callApi: vi.fn<ApiProvider['callApi']>().mockRejectedValue(new Error('Network error')),
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '',
        error: 'Network error',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('re-throws AbortError from getTargetResponse and does not swallow it', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const mockProvider = createMockProvider({
        callApi: vi.fn<ApiProvider['callApi']>().mockRejectedValue(abortError),
      });

      await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
        'The operation was aborted',
      );
    });

    it('swallows non-AbortError exceptions and returns error response', async () => {
      const regularError = new Error('API timeout');

      const mockProvider = createMockProvider({
        callApi: vi.fn<ApiProvider['callApi']>().mockRejectedValue(regularError),
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result.error).toBe('API timeout');
      expect(result.output).toBe('');
    });

    describe('Multilingual provider', () => {
      it('getMultilingualProvider returns undefined when not set', async () => {
        // Ensure clean state
        redteamProviderManager.clearProvider();
        const result = await redteamProviderManager.getMultilingualProvider();
        expect(result).toBeUndefined();
      });

      it('setMultilingualProvider caches provider and getMultilingualProvider returns it', async () => {
        const mockProvider = createMockProvider({ id: 'test-multilingual-provider' });

        mockedLoadApiProviders.mockResolvedValueOnce([mockProvider]);

        await redteamProviderManager.setMultilingualProvider('test-multilingual-provider');
        const result = await redteamProviderManager.getMultilingualProvider();

        expect(result).toBe(mockProvider);
        expect(mockedLoadApiProviders).toHaveBeenCalledWith(['test-multilingual-provider']);
      });

      it('setMultilingualProvider uses jsonOnly response_format when defaulting to OpenAI', async () => {
        // Pass undefined to trigger default provider creation
        await redteamProviderManager.setMultilingualProvider(undefined as any);

        // Check that an instance was created with json_object response_format
        expect(mockOpenAiInstances.length).toBe(1);
        expect(mockOpenAiInstances[0].config).toEqual({
          temperature: TEMPERATURE,
          response_format: { type: 'json_object' },
        });
      });
    });
  });

  describe('getTargetResponse', () => {
    it('returns an error before calling the target when the prompt exceeds maxCharsPerMessage', async () => {
      setCliStateConfig({
        redteam: {
          maxCharsPerMessage: 5,
        },
      });
      const mockProvider = createMockProvider({
        response: {
          output: 'test response',
          tokenUsage: { numRequests: 1 },
        },
      });

      const result = await getTargetResponse(mockProvider, 'too long');

      expect(mockProvider.callApi).not.toHaveBeenCalled();
      expect(result).toEqual({
        output: '',
        error: 'Target prompt message at prompt exceeds maxCharsPerMessage=5: 8 characters.',
        tokenUsage: { numRequests: 0 },
      });
    });

    it('only enforces maxCharsPerMessage for user messages in chat arrays', async () => {
      setCliStateConfig({
        redteam: {
          maxCharsPerMessage: 5,
        },
      });
      const mockProvider = createMockProvider({
        response: {
          output: 'ok',
          tokenUsage: { numRequests: 1 },
        },
      });
      const prompt = JSON.stringify([
        { role: 'system', content: 'this system message is long' },
        { role: 'user', content: 'short' },
      ]);

      const result = await getTargetResponse(mockProvider, prompt);

      expect(mockProvider.callApi).toHaveBeenCalledWith(prompt, undefined, undefined);
      expect(result.output).toBe('ok');
    });

    it('uses maxCharsPerMessage from test metadata when cliState is unset', async () => {
      const mockProvider = createMockProvider({
        response: {
          output: 'test response',
          tokenUsage: { numRequests: 1 },
        },
      });
      const context = {
        prompt: { raw: '', label: '' },
        vars: {},
        test: {
          metadata: {
            pluginConfig: {
              maxCharsPerMessage: 5,
            },
          },
        },
      } as CallApiContextParams;

      const result = await getTargetResponse(mockProvider, 'too long', context);

      expect(mockProvider.callApi).not.toHaveBeenCalled();
      expect(result.error).toBe(
        'Target prompt message at prompt exceeds maxCharsPerMessage=5: 8 characters.',
      );
    });

    it('checks GOAT audio/image hybrid payload transcript text without counting base64 blobs', async () => {
      const mockProvider = createMockProvider({
        response: {
          output: 'ok',
          tokenUsage: { numRequests: 1 },
        },
      });
      const context = {
        prompt: { raw: '', label: '' },
        vars: {},
        test: {
          metadata: {
            pluginConfig: {
              maxCharsPerMessage: 5,
            },
          },
        },
      } as CallApiContextParams;
      const prompt = JSON.stringify({
        _promptfoo_audio_hybrid: true,
        history: [
          { role: 'user', content: 'tiny' },
          { role: 'assistant', content: 'this assistant response is long and should be ignored' },
        ],
        currentTurn: {
          role: 'user',
          transcript: 'short',
          image: {
            data: 'a'.repeat(500),
            format: 'png',
          },
        },
      });

      const result = await getTargetResponse(mockProvider, prompt, context);

      expect(mockProvider.callApi).toHaveBeenCalledWith(prompt, context, undefined);
      expect(result.output).toBe('ok');
    });

    it('rejects GOAT audio/image hybrid payloads when currentTurn transcript exceeds maxCharsPerMessage', async () => {
      const mockProvider = createMockProvider({
        response: {
          output: 'ok',
          tokenUsage: { numRequests: 1 },
        },
      });
      const context = {
        prompt: { raw: '', label: '' },
        vars: {},
        test: {
          metadata: {
            pluginConfig: {
              maxCharsPerMessage: 5,
            },
          },
        },
      } as CallApiContextParams;
      const prompt = JSON.stringify({
        _promptfoo_audio_hybrid: true,
        history: [],
        currentTurn: {
          role: 'user',
          transcript: 'too long',
          audio: {
            data: 'a'.repeat(500),
            format: 'mp3',
          },
        },
      });

      const result = await getTargetResponse(mockProvider, prompt, context);

      expect(mockProvider.callApi).not.toHaveBeenCalled();
      expect(result.error).toBe(
        'Target prompt message at currentTurn.transcript exceeds maxCharsPerMessage=5: 8 characters.',
      );
    });

    it('returns successful response with string output', async () => {
      const mockProvider = createMockProvider({
        response: {
          output: 'test response',
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          sessionId: 'test-session',
        },
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: 'test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
        sessionId: 'test-session',
      });
    });

    it('passes through context and options', async () => {
      const mockCallApi = vi.fn().mockResolvedValue({
        output: 'test response',
        tokenUsage: { numRequests: 1 },
      });

      const mockProvider = createMockProvider({ callApi: mockCallApi });

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
      const mockProvider = createMockProvider({
        response: {
          output: { key: 'value' },
          tokenUsage: { numRequests: 1 },
        },
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '{"key":"value"}',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('handles provider error response', async () => {
      const mockProvider = createMockProvider({
        response: {
          error: 'API error',
          sessionId: 'error-session',
        },
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '',
        error: 'API error',
        sessionId: 'error-session',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('respects provider delay for non-cached responses', async () => {
      const mockProvider = createMockProvider({
        delay: 100,
        response: {
          output: 'test response',
          tokenUsage: { numRequests: 1 },
        },
      });

      await getTargetResponse(mockProvider, 'test prompt');

      expect(mockedSleep).toHaveBeenCalledWith(100);
    });

    it('skips delay for cached responses', async () => {
      const mockProvider = createMockProvider({
        delay: 100,
        response: {
          output: 'test response',
          cached: true,
          tokenUsage: { numRequests: 1 },
        },
      });

      await getTargetResponse(mockProvider, 'test prompt');

      expect(mockedSleep).not.toHaveBeenCalled();
    });

    it('throws error when neither output nor error is set', async () => {
      const mockProvider = createMockProvider({ response: {} });

      await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
        /Target returned malformed response: expected either `output` or `error` property to be set/,
      );
    });

    it('uses default tokenUsage when not provided', async () => {
      const mockProvider = createMockProvider({
        response: {
          output: 'test response',
        },
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: 'test response',
        tokenUsage: { numRequests: 1 },
      });
    });

    it('accepts conversationEnded without output or error', async () => {
      const mockProvider = createMockProvider({
        response: {
          conversationEnded: true,
          conversationEndReason: 'thread_closed',
        },
      });

      const result = await getTargetResponse(mockProvider, 'test prompt');

      expect(result).toEqual({
        output: '',
        conversationEnded: true,
        conversationEndReason: 'thread_closed',
        tokenUsage: { numRequests: 1 },
      });
    });

    describe('edge cases for empty and falsy responses', () => {
      it('handles empty string output correctly', async () => {
        const mockProvider = createMockProvider({
          response: {
            output: '', // Empty string
            tokenUsage: { numRequests: 1 },
          },
        });

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: '',
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles zero output correctly', async () => {
        const mockProvider = createMockProvider({
          response: {
            output: 0, // Zero value
            tokenUsage: { numRequests: 1 },
          },
        });

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: '0', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles false output correctly', async () => {
        const mockProvider = createMockProvider({
          response: {
            output: false, // Boolean false
            tokenUsage: { numRequests: 1 },
          },
        });

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: 'false', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('handles null output correctly', async () => {
        const mockProvider = createMockProvider({
          response: {
            output: null, // Null value
            tokenUsage: { numRequests: 1 },
          },
        });

        const result = await getTargetResponse(mockProvider, 'test prompt');

        expect(result).toEqual({
          output: 'null', // Should be stringified
          tokenUsage: { numRequests: 1 },
        });
      });

      it('still fails when output property is missing', async () => {
        const mockProvider = createMockProvider({
          response: {
            // No output property at all
            tokenUsage: { numRequests: 1 },
          },
        });

        await expect(getTargetResponse(mockProvider, 'test prompt')).rejects.toThrow(
          /Target returned malformed response: expected either `output` or `error` property to be set/,
        );
      });

      it('still fails when both output and error are missing', async () => {
        const mockProvider = createMockProvider({
          response: {
            someOtherField: 'value',
          } as any,
        });

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

  describe('formatRedteamHistoryAsTranscript', () => {
    it('formats turn history as a readable transcript', () => {
      const result = formatRedteamHistoryAsTranscript([
        { prompt: 'first question', output: 'first response' },
        { prompt: 'second question', output: 'second response' },
      ]);

      expect(result).toBe(
        'Turn 1:\nUser: first question\nAssistant: first response\n\nTurn 2:\nUser: second question\nAssistant: second response',
      );
    });

    it('returns an empty string for empty history', () => {
      expect(formatRedteamHistoryAsTranscript([])).toBe('');
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
      expect(mockedCheckServerFeatureSupport).not.toHaveBeenCalled();
    });

    it('checks server support when PROMPTFOO_ENABLE_UNBLOCKING=true', async () => {
      process.env.PROMPTFOO_ENABLE_UNBLOCKING = 'true';
      mockedCheckServerFeatureSupport.mockResolvedValue(false);

      const result = await tryUnblocking({
        messages: [],
        lastResponse: 'What industry are you in?',
        goal: 'test-goal',
        purpose: 'test-purpose',
      });

      expect(result.success).toBe(false);
      expect(mockedCheckServerFeatureSupport).toHaveBeenCalledWith(
        'blocking-question-analysis',
        BLOCKING_QUESTION_ANALYSIS_FEATURE_FLAG_TIMESTAMP,
      );
    });
  });

  describe('grader assertion helpers', () => {
    const singleAssertion: Assertion = {
      type: 'llm-rubric',
      value: 'original rubric',
    };
    const assertionSet: AssertionSet = {
      type: 'assert-set',
      assert: [singleAssertion],
    };

    it('uses grade assertion when present', () => {
      expect(
        buildGraderResultAssertion(
          { type: 'javascript', pass: true, score: 1, reason: 'ok' } as Assertion,
          singleAssertion,
          'rendered rubric',
        ),
      ).toEqual({
        type: 'javascript',
        pass: true,
        score: 1,
        reason: 'ok',
        value: 'rendered rubric',
      });
    });

    it('falls back to a single assertion and exposes its value', () => {
      expect(buildGraderResultAssertion(undefined, singleAssertion, 'rendered rubric')).toEqual({
        type: 'llm-rubric',
        value: 'rendered rubric',
      });
      expect(getGraderAssertionValue(singleAssertion)).toBe('original rubric');
    });

    it('ignores assert-set assertions and undefined values', () => {
      expect(
        buildGraderResultAssertion(undefined, assertionSet, 'rendered rubric'),
      ).toBeUndefined();
      expect(getGraderAssertionValue(assertionSet)).toBeUndefined();
      expect(getGraderAssertionValue(undefined)).toBeUndefined();
    });
  });
});
