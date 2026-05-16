import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import logger from '../../../src/logger';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getCache: vi.fn(),
    isCacheEnabled: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const projectUrl = 'https://test.services.ai.azure.com/api/projects/test-project';
const mockAgent = {
  id: 'agent_123',
  name: 'weather-agent',
  object: 'agent',
  versions: {
    latest: {},
  },
} as any;

function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function createMessageResponse(text: string) {
  return {
    id: 'resp_123',
    model: 'gpt-4.1',
    error: null,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  } as any;
}

function createFunctionCallResponse() {
  return {
    id: 'resp_tool',
    model: 'gpt-4.1',
    error: null,
    conversation: { id: 'conv_123' },
    output: [
      {
        type: 'function_call',
        id: 'fc_123',
        call_id: 'call_123',
        name: 'get_weather',
        arguments: '{"location":"Paris"}',
        status: 'completed',
      },
    ],
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      total_tokens: 30,
    },
  } as any;
}

describe('AzureFoundryAgentProvider', () => {
  let mockResponsesCreate: ReturnType<typeof vi.fn>;
  let mockGetAgent: ReturnType<typeof vi.fn>;
  let mockListAgents: ReturnType<typeof vi.fn>;
  let mockClient: any;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ AZURE_AI_PROJECT_URL: undefined });

    mockResponsesCreate = vi.fn();
    mockGetAgent = vi.fn();
    mockListAgents = vi.fn().mockReturnValue(createAsyncIterable([]));
    mockClient = {
      agents: {
        get: mockGetAgent,
        list: mockListAgents,
      },
      getOpenAIClient: vi.fn(() => ({
        responses: {
          create: mockResponsesCreate,
        },
      })),
    };

    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'initializeClient').mockResolvedValue(
      mockClient,
    );
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe('instantiation', () => {
    it('should create provider with minimal config', () => {
      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
        },
      });

      expect(provider).toBeDefined();
      expect(provider.deploymentName).toBe('weather-agent');
    });

    it('should throw when projectUrl is missing', () => {
      expect(() => new AzureFoundryAgentProvider('weather-agent', { config: {} })).toThrow(
        'Azure AI Project URL must be provided',
      );
    });

    it('should accept projectUrl from AZURE_AI_PROJECT_URL', () => {
      const restoreProjectUrl = mockProcessEnv({ AZURE_AI_PROJECT_URL: projectUrl });
      try {
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: {},
        });

        expect(provider).toBeDefined();
      } finally {
        restoreProjectUrl();
      }
    });
  });

  describe('v2 responses runtime', () => {
    it('should call responses.create for a resolved agent', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createMessageResponse('Test response'));

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
          temperature: 0.2,
          top_p: 0.8,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(mockGetAgent).toHaveBeenCalledWith('weather-agent');
      expect(mockClient.getOpenAIClient).toHaveBeenCalledTimes(1);
      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [
            {
              type: 'message',
              role: 'user',
              content: 'test prompt',
            },
          ],
          temperature: 0.2,
          top_p: 0.8,
        }),
        {
          body: {
            agent_reference: {
              name: 'weather-agent',
              type: 'agent_reference',
            },
          },
        },
      );
      // Guard against regressing to the deprecated `agent` key, which the
      // Foundry Responses API now rejects with a 400.
      const responseOptions = mockResponsesCreate.mock.calls[0][1];
      expect(responseOptions.body).not.toHaveProperty('agent');
      expect(result.output).toBe('Test response');
    });

    it('should fall back to listing agents for legacy ids', async () => {
      mockGetAgent.mockRejectedValue(new Error('not found'));
      mockListAgents.mockReturnValue(
        createAsyncIterable([
          { ...mockAgent, id: 'asst_legacy' },
          { ...mockAgent, id: 'other' },
        ]),
      );
      mockResponsesCreate.mockResolvedValue(createMessageResponse('Listed response'));

      const provider = new AzureFoundryAgentProvider('asst_legacy', {
        config: {
          projectUrl,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(mockGetAgent).toHaveBeenCalledWith('asst_legacy');
      expect(mockListAgents).toHaveBeenCalledTimes(1);
      expect(mockResponsesCreate).toHaveBeenCalledWith(expect.any(Object), {
        body: {
          agent_reference: {
            name: 'weather-agent',
            type: 'agent_reference',
          },
        },
      });
      expect(result.output).toBe('Listed response');
    });

    it('should map max_completion_tokens and response_format to Responses API fields', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createMessageResponse('{"ok":true}'));

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
          max_tokens: 150,
          max_completion_tokens: 200,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'answer',
              strict: false,
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                },
                additionalProperties: false,
              },
            },
          },
        },
      });

      const result = await provider.callApi('test prompt');

      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_output_tokens: 200,
          text: {
            format: {
              type: 'json_schema',
              name: 'answer',
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                },
                additionalProperties: false,
              },
              strict: false,
            },
          },
        }),
        expect.any(Object),
      );
      expect(result.output).toEqual({ ok: true });
    });

    it('should execute prompt-level function callbacks and continue with function_call_output items', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate
        .mockResolvedValueOnce(createFunctionCallResponse())
        .mockResolvedValueOnce(createMessageResponse('Tool finished'));
      const callback = vi.fn().mockResolvedValue({ forecast: 'sunny' });

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
        },
      });

      const result = await provider.callApi('test prompt', {
        prompt: {
          config: {
            functionToolCallbacks: {
              get_weather: callback,
            },
          },
        },
      } as any);

      expect(callback).toHaveBeenCalledWith(
        '{"location":"Paris"}',
        expect.objectContaining({
          threadId: 'conv_123',
          runId: 'resp_tool',
          assistantId: 'agent_123',
          provider: 'azure-foundry',
        }),
      );
      expect(mockResponsesCreate).toHaveBeenNthCalledWith(
        2,
        {
          input: [
            {
              type: 'function_call_output',
              call_id: 'call_123',
              output: '{"forecast":"sunny"}',
            },
          ],
          previous_response_id: 'resp_tool',
        },
        {
          body: {
            agent_reference: {
              name: 'weather-agent',
              type: 'agent_reference',
            },
          },
        },
      );
      expect(result.output).toBe('Tool finished');
    });

    it('should return unresolved function calls when callbacks are missing', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createFunctionCallResponse());

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
      expect(result.output).toContain('"type":"function_call"');
      expect(result.output).toContain('"name":"get_weather"');
    });

    it('should return error when agent is not found by name or id', async () => {
      mockGetAgent.mockRejectedValue(new Error('not found'));
      mockListAgents.mockReturnValue(createAsyncIterable([]));

      const provider = new AzureFoundryAgentProvider('nonexistent-agent', {
        config: { projectUrl },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain("'nonexistent-agent' was not found");
      expect(result.error).toContain('azure:foundry-agent:<agent-name>');
    });

    it('should return timeout error when callback loop exceeds maxPollTimeMs', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      // Always return function calls so the loop never breaks naturally
      mockResponsesCreate.mockResolvedValue(createFunctionCallResponse());

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
          maxPollTimeMs: 100,
          functionToolCallbacks: {
            get_weather: vi.fn().mockResolvedValue('sunny'),
          },
        },
      });

      // Make Date.now() jump past the timeout after the first iteration
      const originalDateNow = Date.now;
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First two calls (start + loop check) return 0, then jump past timeout
        return callCount <= 2 ? 0 : 200;
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('tool-calling loop timed out after 100ms');
      Date.now = originalDateNow;
    });

    it('should warn once and omit unsupported per-request fields', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createMessageResponse('Test response'));

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: {
          projectUrl,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          retryOptions: { maxRetries: 2 },
          seed: 123,
          stop: ['END'],
          timeoutMs: 1000,
          tool_resources: {
            file_search: {
              vector_store_ids: ['vs_123'],
            },
          },
        },
      });

      await provider.callApi('first prompt');
      await provider.callApi('second prompt');

      const firstRequestBody = mockResponsesCreate.mock.calls[0][0];
      expect(firstRequestBody).not.toHaveProperty('frequency_penalty');
      expect(firstRequestBody).not.toHaveProperty('presence_penalty');
      expect(firstRequestBody).not.toHaveProperty('retryOptions');
      expect(firstRequestBody).not.toHaveProperty('seed');
      expect(firstRequestBody).not.toHaveProperty('stop');
      expect(firstRequestBody).not.toHaveProperty('timeoutMs');
      expect(firstRequestBody).not.toHaveProperty('tool_resources');
      expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
    });

    it('should hash the request body in cache keys', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createMessageResponse('Test response'));

      const mockCache = {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockResolvedValue(mockCache as any);

      const secret = 'sk-test-12345678901234567890';
      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });

      await provider.callApi(`weather in Paris ${secret}`);

      const cacheKey = mockCache.get.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(/^azure_foundry_agent:weather-agent:[a-f0-9]{64}:[a-f0-9]{64}$/);
      expect(cacheKey).not.toContain(projectUrl);
      expect(cacheKey).not.toContain(secret);
      expect(cacheKey).not.toContain('weather in Paris');
      expect(mockCache.set).toHaveBeenCalledWith(cacheKey, expect.any(Object));
    });

    it('should scope cache keys by project URL', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockResolvedValue(createMessageResponse('Test response'));

      const mockCache = {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockResolvedValue(mockCache as any);

      const prompt = 'same weather prompt';
      const otherProjectUrl = 'https://test.services.ai.azure.com/api/projects/other-project';
      const providerA = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });
      const providerB = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl: otherProjectUrl },
      });

      await providerA.callApi(prompt);
      await providerB.callApi(prompt);

      const [cacheKeyA, cacheKeyB] = mockCache.get.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).toMatch(/^azure_foundry_agent:weather-agent:[a-f0-9]{64}:[a-f0-9]{64}$/);
      expect(cacheKeyB).toMatch(/^azure_foundry_agent:weather-agent:[a-f0-9]{64}:[a-f0-9]{64}$/);
      expect(cacheKeyA).not.toBe(cacheKeyB);
      expect(cacheKeyA).not.toContain(projectUrl);
      expect(cacheKeyB).not.toContain(otherProjectUrl);
      expect(cacheKeyA).not.toContain(prompt);
      expect(cacheKeyB).not.toContain(prompt);
    });

    it('should not log raw prompts on cache hits', async () => {
      const secret = 'cached-foundry-secret-prompt';
      const mockCache = {
        get: vi.fn().mockResolvedValue({ output: 'cached response' }),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockResolvedValue(mockCache as any);

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });

      await provider.callApi(`weather in Paris ${secret}`);

      const debugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
      expect(debugLogs).not.toContain(secret);
      expect(debugLogs).not.toContain('weather in Paris');
      expect(debugLogs).toContain('Cache hit for Foundry agent response');
    });
  });

  describe('error formatting', () => {
    it('should return guardrails response for content filter errors', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockRejectedValue(
        new Error('Content filter triggered: The prompt contained inappropriate content'),
      );

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toContain('content filtering system');
      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
      });
    });

    it('should format rate limit errors', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockRejectedValue(new Error('429 Too Many Requests'));

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should format generic errors', async () => {
      mockGetAgent.mockResolvedValue(mockAgent);
      mockResponsesCreate.mockRejectedValue(new Error('Something unexpected happened'));

      const provider = new AzureFoundryAgentProvider('weather-agent', {
        config: { projectUrl },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Error in Azure Foundry Agent API call');
      expect(result.error).toContain('Something unexpected happened');
    });

    describe('SDK-shape 429 classification (classifySdkRateLimit)', () => {
      // The OpenAI / Azure SDK rejects with a plain object that has `status`,
      // not an HttpRateLimitError instance, since it bypasses fetchWithRetries.
      // We verify formatError still classifies these correctly by `status === 429`
      // and the body-level error code.

      function makeSdkError(status: number, code?: string, message = 'sdk error'): unknown {
        return Object.assign(new Error(message), { status, error: code ? { code } : undefined });
      }

      it('classifies SDK 429 with insufficient_quota body code as quota', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        mockResponsesCreate.mockRejectedValue(makeSdkError(429, 'insufficient_quota'));
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Quota exceeded');
        expect(result.error).toContain('insufficient_quota');
        expect(result.error).toContain('Retries will not help');
      });

      it('classifies SDK 429 with rate_limit_exceeded body code as rate_limit', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        mockResponsesCreate.mockRejectedValue(makeSdkError(429, 'rate_limit_exceeded'));
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Rate limit exceeded');
        expect(result.error).toContain('rate_limit_exceeded');
        expect(result.error).not.toContain('Retries will not help');
      });

      it('classifies SDK 429 with no body code as rate_limit by default', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        mockResponsesCreate.mockRejectedValue(makeSdkError(429));
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Rate limit exceeded');
        expect(result.error).not.toContain('Retries will not help');
      });

      it('does not misclassify non-429 SDK errors with insufficient_quota body', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        // 500 with the same code shouldn't trigger the rate-limit branch
        mockResponsesCreate.mockRejectedValue(makeSdkError(500, 'insufficient_quota'));
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).not.toContain('Quota exceeded');
        expect(result.error).not.toContain('Rate limit exceeded');
      });

      it('falls through for non-object errors', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        mockResponsesCreate.mockRejectedValue('string error');
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Error in Azure Foundry Agent API call');
      });

      it('detects 429 nested under err.response.status (older SDK shape)', async () => {
        // Some SDK wrappers / older openai-node versions nest the response.
        mockGetAgent.mockResolvedValue(mockAgent);
        const sdkErr = Object.assign(new Error('sdk wrapper'), {
          response: { status: 429 },
          error: { code: 'rate_limit_exceeded' },
        });
        mockResponsesCreate.mockRejectedValue(sdkErr);
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Rate limit exceeded');
        expect(result.error).toContain('rate_limit_exceeded');
      });

      it('prefers body-level err.error.code over top-level err.code', async () => {
        // The OpenAI SDK can set `err.code` to a transport-level value while
        // the body's error.code is the authoritative API code. Body wins.
        mockGetAgent.mockResolvedValue(mockAgent);
        const sdkErr = Object.assign(new Error('sdk shadow'), {
          status: 429,
          code: 'ETIMEDOUT',
          error: { code: 'rate_limit_exceeded' },
        });
        mockResponsesCreate.mockRejectedValue(sdkErr);
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.error).toContain('Rate limit exceeded');
        expect(result.error).toContain('rate_limit_exceeded');
      });

      it('populates metadata.rateLimitKind on SDK 429 errors', async () => {
        mockGetAgent.mockResolvedValue(mockAgent);
        mockResponsesCreate.mockRejectedValue(makeSdkError(429, 'insufficient_quota'));
        const provider = new AzureFoundryAgentProvider('weather-agent', {
          config: { projectUrl },
        });
        const result = await provider.callApi('test prompt');
        expect(result.metadata?.rateLimitKind).toBe('quota');
      });
    });
  });
});
