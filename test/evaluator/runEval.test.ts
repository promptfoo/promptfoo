import './setup';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import {
  type ApiProvider,
  type Prompt,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import { mockGradingApiProviderPasses, resetMockProviders } from './helpers';

describe('runEval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockProviders();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await clearCache();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const mockProvider: ApiProvider = {
    id: vi.fn().mockReturnValue('test-provider'),
    callApi: vi.fn().mockResolvedValue({
      output: 'Test output',
      tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
    }),
  };

  const defaultOptions = {
    delay: 0,
    testIdx: 0,
    promptIdx: 0,
    repeatIndex: 0,
    isRedteam: false,
  };

  it('should handle basic prompt evaluation', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(result.response?.output).toBe('Test output');
    expect(result.prompt.label).toBe('test-label');
    expect(mockProvider.callApi).toHaveBeenCalledWith('Test prompt', expect.anything(), undefined);
  });

  it('should pass dynamic prompt config from prompt functions to the provider', async () => {
    const dynamicConfig = { temperature: 0.5, tools: [{ name: 'test_tool' }] };
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt',
      label: 'dynamic-label',
      function: async () => ({
        prompt: 'Rendered dynamic prompt',
        config: dynamicConfig,
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);

    // Verify the provider received the dynamic config
    const callApiMock = vi.mocked(mockProvider.callApi);
    const callApiArgs = callApiMock.mock.calls[0];
    expect(callApiArgs).toBeDefined();
    const context = callApiArgs![1];
    expect(context).toBeDefined();
    expect(context!.prompt.config).toEqual(dynamicConfig);
  });

  it('should merge dynamic prompt config with test.options (test.options takes precedence)', async () => {
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt',
      label: 'dynamic-label',
      function: async () => ({
        prompt: 'Rendered dynamic prompt',
        config: { temperature: 0.5, max_tokens: 100 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { options: { temperature: 0.9 } },
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);

    // test.options should override dynamic config
    const callApiMock = vi.mocked(mockProvider.callApi);
    const callApiArgs = callApiMock.mock.calls[0];
    expect(callApiArgs).toBeDefined();
    const context = callApiArgs![1];
    expect(context).toBeDefined();
    expect(context!.prompt.config).toEqual({ temperature: 0.9, max_tokens: 100 });
  });

  it('should not leak dynamic prompt config across runEval calls for a shared prompt object', async () => {
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt {{mode}}',
      label: 'dynamic-label',
      config: { top_p: 0.9 },
      function: async ({ vars }) => ({
        prompt: `Rendered dynamic prompt for ${vars.mode}`,
        config:
          vars.mode === 'first'
            ? { temperature: 0.5, response_format: { type: 'json_object' } }
            : { max_tokens: 100 },
      }),
    };

    await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { vars: { mode: 'first' } },
      conversations: {},
      registers: {},
    });

    await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { vars: { mode: 'second' } },
      conversations: {},
      registers: {},
    });

    expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
    const callApiMock = vi.mocked(mockProvider.callApi);

    const firstCallArgs = callApiMock.mock.calls[0];
    const secondCallArgs = callApiMock.mock.calls[1];
    expect(firstCallArgs).toBeDefined();
    expect(secondCallArgs).toBeDefined();
    const firstCallContext = firstCallArgs![1];
    const secondCallContext = secondCallArgs![1];
    expect(firstCallContext).toBeDefined();
    expect(secondCallContext).toBeDefined();
    expect(firstCallContext!.prompt.config).toEqual({
      top_p: 0.9,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });
    expect(secondCallContext!.prompt.config).toEqual({
      top_p: 0.9,
      max_tokens: 100,
    });

    // The original shared prompt object should remain unchanged.
    expect(promptWithFunction.config).toEqual({ top_p: 0.9 });
  });

  it('should keep pre-render fallback config in error result when renderPrompt mutates and throws', async () => {
    const evalHelpers = await import('../../src/evaluatorHelpers');
    const renderPromptSpy = vi
      .spyOn(evalHelpers, 'renderPrompt')
      .mockImplementationOnce(async (promptArg) => {
        promptArg.config = {
          ...(promptArg.config ?? {}),
          response_format: { type: 'mutated-before-throw' },
        };
        throw new Error('render failed');
      });

    const promptWithConfig: Prompt = {
      raw: 'Test prompt',
      label: 'test-label',
      config: { response_format: { type: 'json_object' } },
    };

    try {
      const [result] = await runEval({
        ...defaultOptions,
        provider: mockProvider,
        prompt: promptWithConfig,
        test: { options: { temperature: 0.4 } },
        conversations: {},
        registers: {},
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(ResultFailureReason.ERROR);
      expect(result.prompt.config).toEqual({
        response_format: { type: 'json_object' },
        temperature: 0.4,
      });
      expect(promptWithConfig.config).toEqual({ response_format: { type: 'json_object' } });
      expect(mockProvider.callApi).not.toHaveBeenCalled();
    } finally {
      renderPromptSpy.mockRestore();
    }
  });

  it('should handle conversation history', async () => {
    const conversations = {} as Record<string, any>;

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label' },
      test: {},
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(conversations).toHaveProperty('test-provider:undefined');
    expect(conversations['test-provider:undefined']).toHaveLength(1);
    expect(conversations['test-provider:undefined'][0]).toEqual({
      prompt: 'Hello ',
      input: 'Hello ',
      output: 'Test output',
    });
  });

  it('should handle conversation with custom ID', async () => {
    const conversations = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label', id: 'custom-id' },
      test: { metadata: { conversationId: 'conv1' } },
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(conversations).toHaveProperty('test-provider:custom-id:conv1');
  });

  it('should include sessionId from response in result metadata', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSession: ApiProvider = {
      id: vi.fn().mockReturnValue('session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'response-session-123',
        metadata: { existing: 'value' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithSession,
      prompt: { raw: 'Test prompt', label: 'session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    const [result] = results;
    expect(result?.metadata).toMatchObject({
      sessionId: 'response-session-123',
      existing: 'value',
    });
  });

  it('should include sessionId from vars in result metadata when response lacks sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithoutSession: ApiProvider = {
      id: vi.fn().mockReturnValue('vars-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithoutSession,
      prompt: { raw: 'Test prompt', label: 'vars-session-label' },
      test: { vars: { sessionId: 'vars-session-456' } },
      conversations,
      registers: {},
    });

    const [result] = results;

    expect(result.metadata).toMatchObject({ sessionId: 'vars-session-456' });
  });

  it('should include sessionId from response metadata when top-level sessionId is absent', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-789', existing: 'keep-me' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({
      sessionId: 'metadata-session-789',
      existing: 'keep-me',
    });
  });

  it('should prioritize response metadata sessionId over vars sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-priority' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: { sessionId: 'vars-session-ignored' } },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionId: 'metadata-session-priority' });
  });

  it('should include sessionIds from response metadata without adding sessionId fallback', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSessionIds: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-ids-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionIds: ['session-a', 'session-b'] },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithSessionIds,
      prompt: { raw: 'Test prompt', label: 'metadata-session-ids-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionIds: ['session-a', 'session-b'] });
    expect(result.metadata).not.toHaveProperty('sessionId');
  });

  it('should include sessionId from test metadata when provider omits session details', async () => {
    const conversations: Record<string, any[]> = {};

    const [result] = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-metadata-session-label' },
      test: { metadata: { sessionId: 'test-metadata-session' } },
      conversations,
      registers: {},
    });

    expect(result?.metadata).toMatchObject({ sessionId: 'test-metadata-session' });
  });

  it('should preserve provider error context and plugin metadata on failure', async () => {
    const apiError: any = new Error('Request failed with status code 400');
    apiError.response = {
      status: 400,
      statusText: 'Bad Request',
      data: 'Invalid payload',
    };

    const failingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('failing-provider'),
      label: 'Azure GPT 5',
      callApi: vi.fn().mockRejectedValue(apiError),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: failingProvider,
      prompt: { raw: 'Test prompt', label: 'error-label' },
      test: { metadata: { pluginId: 'plugin-123', strategyId: 'basic' } },
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
    expect(result.metadata?.errorContext).toMatchObject({
      providerId: 'failing-provider',
      providerLabel: 'Azure GPT 5',
      status: 400,
      statusText: 'Bad Request',
    });
    expect(result.metadata?.errorContext?.responseSnippet).toContain('Invalid payload');
    expect(result.metadata?.pluginId).toBe('plugin-123');
    expect(result.metadata?.strategyId).toBe('basic');
    expect(result.error).toContain('Request failed with status code 400');
  });

  it('should handle registers', async () => {
    const registers = { savedValue: 'stored data' };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Using {{savedValue}}', label: 'test-label' },
      test: {},
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(mockProvider.callApi).toHaveBeenCalledWith(
      'Using stored data',
      expect.anything(),
      undefined,
    );
  });

  it('should store output in register when specified', async () => {
    const registers = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: { options: { storeOutputAs: 'myOutput' } },
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(registers).toHaveProperty('myOutput', 'Test output');
  });

  it('should handle provider errors', async () => {
    const errorProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('error-provider'),
      callApi: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    // Define defaultOptions locally for this test
    const defaultOptions = {
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
    };

    const results = await runEval({
      ...defaultOptions,
      provider: errorProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(false);
    expect(result.error).toContain('API Error');
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
  });

  it('should handle null output differently for red team tests', async () => {
    const nullOutputProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('null-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: null,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    // Regular test
    const regularResults = await runEval({
      ...defaultOptions,
      provider: nullOutputProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(regularResults[0].success).toBe(false);
    expect(regularResults[0].error).toBe('No output');

    // Red team test
    const redTeamResults = await runEval({
      ...defaultOptions,
      provider: nullOutputProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(redTeamResults[0].success).toBe(true);
    expect(redTeamResults[0].error).toBeUndefined();
  });

  it('should apply transforms in correct order', async () => {
    const providerWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('transform-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'original',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: 'output + "-provider"',
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithTransform,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        options: { transform: 'output + "-test"' },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].success).toBe(true);
    expect(results[0].response?.output).toBe('original-provider-test');
  });

  it('should skip rendering redteam inject variable to prevent nunjucks errors on template syntax', async () => {
    // This tests the fix for Discord issue where redteam prompts containing {{purpose | trim}}
    // caused "TypeError: Cannot read properties of undefined (reading 'replace')"
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          // This contains template syntax that would fail if rendered (purpose is undefined)
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          injectVar: 'prompt',
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // The inject var should be preserved as-is, not rendered
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should fail before calling the provider when redteam maxCharsPerMessage is exceeded', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'should not be called' });

    const results = await runEval({
      ...defaultOptions,
      provider: {
        id: () => 'test-provider',
        callApi,
      },
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'this is too long',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          maxCharsPerMessage: 10,
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(callApi).not.toHaveBeenCalled();
    expect(results[0].error).toContain('maxCharsPerMessage=10');
  });

  it('should not enforce redteam maxCharsPerMessage for non-redteam evals', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'success' });

    const results = await runEval({
      ...defaultOptions,
      provider: {
        id: () => 'test-provider',
        callApi,
      },
      prompt: { raw: 'this prompt is longer than ten chars', label: 'test-label' },
      test: {},
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          maxCharsPerMessage: 10,
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(results[0].success).toBe(true);
    expect(results[0].response?.output).toBe('success');
  });

  it('should use default injectVar "prompt" when not explicitly set in redteam config', async () => {
    // Tests the fallback to default 'prompt' injectVar when redteam config exists but injectVar is undefined
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          // injectVar NOT set - should fall back to 'prompt'
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // Should still skip rendering the default 'prompt' var
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer a non-default injectVar when redteam config omits it and prompt is absent', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {},
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering generated redteam exports without a top-level redteam block', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: {
          pluginId: 'ascii-smuggling',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering generated redteam exports identified by metadata and llm-rubric assertions', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Return pass when the response is a string',
          },
        ],
        metadata: {
          pluginId: 'xstest',
          pluginConfig: {
            modifiers: {},
          },
          severity: 'medium',
        },
        options: { provider: mockGradingApiProviderPasses },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer the inject variable for generated redteam exports without config', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: {
          pluginId: 'ascii-smuggling',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer the inject variable from the undecorated prompt template', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: {
        raw: 'Locale: {{locale}}\nUser said: {{query}}',
        template: 'User said: {{query}}',
        label: 'test-label',
      },
      test: {
        vars: {
          locale: 'en-US',
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: {
          pluginId: 'ascii-smuggling',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering when redteam assertions are nested inside assert-set', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [
          {
            type: 'assert-set',
            assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
          },
        ],
        metadata: {
          pluginId: 'ascii-smuggling',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should continue rendering non-redteam tests that only set pluginId metadata', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          name: 'Alice',
          query: 'Hello {{name}}',
        },
        metadata: {
          pluginId: 'ascii-smuggling',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('Hello Alice');
    expect(results[0].prompt.raw).not.toContain('{{name}}');
  });

  describe('latencyMs handling', () => {
    it('should use provider-supplied latencyMs when available', async () => {
      const providerWithLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 5000,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(5000);
    });

    it('should use provider-supplied latencyMs for cached responses', async () => {
      const cachedProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('cached-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Cached output',
          cached: true,
          latencyMs: 3500,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: cachedProvider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(3500);
      expect(results[0].response?.cached).toBe(true);
    });

    it('should fall back to measured latency when provider does not supply latencyMs', async () => {
      vi.useFakeTimers();

      const providerWithoutLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('no-latency-provider'),
        callApi: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            output: 'Test output',
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
          };
        }),
      };

      try {
        const resultPromise = runEval({
          ...defaultOptions,
          provider: providerWithoutLatency,
          prompt: { raw: 'Test prompt', label: 'test-label' },
          test: {},
          conversations: {},
          registers: {},
        });
        await vi.runAllTimersAsync();
        const results = await resultPromise;

        // Should have measured latency (>= 45ms accounting for timer precision)
        expect(results[0].latencyMs).toBeGreaterThanOrEqual(45);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should respect provider latencyMs of 0', async () => {
      const providerWithZeroLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('zero-latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 0,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithZeroLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(0);
    });
  });
});
