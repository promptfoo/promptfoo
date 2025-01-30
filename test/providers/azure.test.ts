import { fetchWithCache } from '../../src/cache';
import {
  AzureChatCompletionProvider,
  AzureCompletionProvider,
  AzureGenericProvider,
} from '../../src/providers/azure';
import { maybeEmitAzureOpenAiWarning } from '../../src/providers/azureUtil';
import { HuggingfaceTextGenerationProvider } from '../../src/providers/huggingface';
import { OpenAiCompletionProvider } from '../../src/providers/openai';
import type { TestCase, TestSuite } from '../../src/types';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('maybeEmitAzureOpenAiWarning', () => {
  it('should not emit warning when no Azure providers are used', () => {
    const testSuite: TestSuite = {
      providers: [new OpenAiCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should not emit warning when Azure provider is used alone, but no model graded eval', () => {
    const testSuite: TestSuite = {
      providers: [new AzureCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'equals' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should emit warning when Azure provider is used alone, but with model graded eval', () => {
    const testSuite: TestSuite = {
      providers: [new AzureCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(true);
  });

  it('should emit warning when Azure provider used with non-OpenAI provider', () => {
    const testSuite: TestSuite = {
      providers: [new AzureCompletionProvider('foo'), new HuggingfaceTextGenerationProvider('bar')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(true);
  });

  it('should not emit warning when Azure providers are used with a default provider set', () => {
    const testSuite: TestSuite = {
      providers: [new AzureCompletionProvider('foo')],
      defaultTest: { options: { provider: 'azureopenai:....' } },
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should not emit warning when both Azure and OpenAI providers are used', () => {
    const testSuite: TestSuite = {
      providers: [new AzureCompletionProvider('foo'), new OpenAiCompletionProvider('bar')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });
});

describe('AzureOpenAiGenericProvider', () => {
  describe('getApiBaseUrl', () => {
    beforeEach(() => {
      delete process.env.AZURE_OPENAI_API_HOST;
    });

    it('should return apiBaseUrl if set', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should return apiBaseUrl without trailing slash if set', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should construct URL from apiHost without protocol', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove protocol from apiHost if present', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'https://api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove trailing slash from apiHost if present', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should return undefined if neither apiBaseUrl nor apiHost is set', () => {
      const provider = new AzureGenericProvider('test-deployment', {});
      expect(provider.getApiBaseUrl()).toBeUndefined();
    });
  });
});

describe('AzureOpenAiChatCompletionProvider', () => {
  describe('config merging', () => {
    let provider: AzureChatCompletionProvider;

    beforeEach(() => {
      provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiHost: 'test.azure.com',
          apiKey: 'test-key',
          functions: [{ name: 'provider_func', parameters: {} }],
          max_tokens: 100,
          temperature: 0.5,
        },
      });
    });

    it('should use provider config when no prompt config exists', () => {
      const context = {
        prompt: { label: 'test prompt', raw: 'test prompt' },
        vars: {},
      };
      expect((provider as any).getOpenAiBody('test prompt', context).body).toMatchObject({
        functions: [{ name: 'provider_func', parameters: {} }],
        max_tokens: 100,
        temperature: 0.5,
      });
    });

    it('should merge prompt config with provider config', () => {
      const context = {
        prompt: {
          config: {
            functions: [{ name: 'prompt_func', parameters: {} }],
            temperature: 0.7,
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      };
      expect((provider as any).getOpenAiBody('test prompt', context).body).toMatchObject({
        functions: [{ name: 'prompt_func', parameters: {} }],
        max_tokens: 100,
        temperature: 0.7,
      });
    });

    it('should handle undefined prompt config', () => {
      const context = {
        prompt: { label: 'test prompt', raw: 'test prompt' },
        vars: {},
      };
      expect((provider as any).getOpenAiBody('test prompt', context).body).toMatchObject({
        functions: [{ name: 'provider_func', parameters: {} }],
        max_tokens: 100,
        temperature: 0.5,
      });
    });

    it('should handle empty prompt config', () => {
      const context = {
        prompt: { config: {}, label: 'test prompt', raw: 'test prompt' },
        vars: {},
      };
      expect((provider as any).getOpenAiBody('test prompt', context).body).toMatchObject({
        functions: [{ name: 'provider_func', parameters: {} }],
        max_tokens: 100,
        temperature: 0.5,
      });
    });

    it('should handle complex nested config merging', () => {
      const context = {
        prompt: {
          config: {
            response_format: { type: 'json_object' },
            tool_choice: { function: { name: 'test' }, type: 'function' },
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      };
      expect((provider as any).getOpenAiBody('test prompt', context).body).toMatchObject({
        functions: [{ name: 'provider_func', parameters: {} }],
        max_tokens: 100,
        response_format: { type: 'json_object' },
        temperature: 0.5,
        tool_choice: { function: { name: 'test' }, type: 'function' },
      });
    });

    it('should handle json_schema response format', () => {
      const context = {
        prompt: {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    test: { type: 'string' },
                  },
                  required: ['test'],
                  additionalProperties: false,
                },
              },
            },
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      };
      const { body } = (provider as any).getOpenAiBody('test prompt', context);
      expect(body.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              test: { type: 'string' },
            },
            required: ['test'],
            additionalProperties: false,
          },
        },
      });
    });

    it('should render variables in response format', () => {
      const context = {
        prompt: {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: '{{schemaName}}',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    test: { type: 'string' },
                  },
                },
              },
            },
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {
          schemaName: 'dynamic_schema',
        },
      };
      const { body } = (provider as any).getOpenAiBody('test prompt', context);
      expect(body.response_format.json_schema.name).toBe('dynamic_schema');
    });
  });

  describe('response handling', () => {
    let provider: AzureChatCompletionProvider;

    beforeEach(() => {
      provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiHost: 'test.azure.com',
          apiKey: 'test-key',
        },
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should parse JSON response with json_schema format when finish_reason is not content_filter', async () => {
      const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ test: 'value' }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      provider.config.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'test_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              test: { type: 'string' },
            },
            required: ['test'],
            additionalProperties: false,
          },
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual({ test: 'value' });
    });

    it('should handle content_filter finish_reason', async () => {
      const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'content_filter',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe(
        'The generated content was filtered due to triggering Azure OpenAI Service’s content filtering system.',
      );
    });

    it('should handle API errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API Error'));

      const result = await provider.callApi('test prompt');
      expect(result.error).toBe('API call error: API Error');
    });

    it('should handle invalid JSON response', async () => {
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: 'invalid json',
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');
      expect(result.error).toContain('API returned invalid JSON response');
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'test',
                    arguments: '{}',
                  },
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual([
        {
          type: 'function',
          function: {
            name: 'test',
            arguments: '{}',
          },
        },
      ]);
    });

    it('should handle content filter error response', async () => {
      const mockResponse = {
        error: {
          message:
            "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
          code: 'content_filter',
          status: 400,
          innererror: {
            code: 'ResponsibleAIPolicyViolation',
            content_filter_result: {
              hate: { filtered: true, severity: 'medium' },
              jailbreak: { filtered: false, detected: false },
              self_harm: { filtered: false, severity: 'safe' },
              sexual: { filtered: false, severity: 'safe' },
              violence: { filtered: false, severity: 'low' },
            },
          },
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe(mockResponse.error.message);
      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
      });
    });
  });

  describe('structured outputs', () => {
    let provider: AzureChatCompletionProvider;

    beforeEach(() => {
      provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiHost: 'test.azure.com',
          apiKey: 'test-key',
        },
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should parse JSON response when prompt config specifies json_object format', async () => {
      const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"result": 42, "explanation": "test"}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt', {
        prompt: {
          config: {
            response_format: { type: 'json_object' },
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      });

      expect(result.output).toEqual({
        result: 42,
        explanation: 'test',
      });
    });

    it('should handle invalid JSON when response format is specified', async () => {
      const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Invalid JSON response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt', {
        prompt: {
          config: {
            response_format: { type: 'json_object' },
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      });

      // Should still return the original string if JSON parsing fails
      expect(result.output).toBe('Invalid JSON response');
    });

    it('should use correct API URL based on datasources config from prompt', async () => {
      const mockResponse = {
        id: 'mock-id',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'test response',
            },
          },
        ],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('test prompt', {
        prompt: {
          config: {
            dataSources: [{ type: 'test' }],
            apiVersion: '2024-custom',
          },
          label: 'test prompt',
          raw: 'test prompt',
        },
        vars: {},
      });

      // Verify the URL includes extensions and uses the custom API version
      expect(jest.mocked(fetchWithCache).mock.calls[0][0]).toContain(
        '/extensions/chat/completions?api-version=2024-custom',
      );
    });
  });
});

describe('AzureCompletionProvider', () => {
  it('should handle basic completion with caching', async () => {
    const provider = new AzureCompletionProvider('test-deployment', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
      },
    });

    const mockResponse = {
      choices: [{ text: 'Test response' }],
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
    };

    jest
      .mocked(fetchWithCache)
      .mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: mockResponse,
        cached: true,
        status: 200,
        statusText: 'OK',
      });

    const result1 = await provider.callApi('Test prompt');
    const result2 = await provider.callApi('Test prompt');

    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    expect(result1.output).toBe('Test response');
    expect(result1.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(result2.tokenUsage).toEqual({ cached: 10, total: 10 });
  });
});
