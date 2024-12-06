import { AzureCompletionProvider } from '../../src/providers/azure';
import { AzureGenericProvider } from '../../src/providers/azure';
import { AzureChatCompletionProvider } from '../../src/providers/azure';
import { maybeEmitAzureOpenAiWarning } from '../../src/providers/azureUtil';
import { HuggingfaceTextGenerationProvider } from '../../src/providers/huggingface';
import { OpenAiCompletionProvider } from '../../src/providers/openai';
import type { TestSuite, TestCase } from '../../src/types';
import { createMockResponse } from '../util/utils';

jest.mock('../../src/logger');
jest.mock('../../src/cache');

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

    it('should parse JSON response with json_schema format', async () => {
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

      jest
        .spyOn(global, 'fetch')
        .mockImplementation()
        .mockResolvedValueOnce(
          createMockResponse({
            json: () => Promise.resolve(mockResponse),
          }),
        );

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual({ test: 'value' });
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest
        .spyOn(global, 'fetch')
        .mockImplementation()
        .mockImplementationOnce(() => {
          throw mockError;
        });

      const result = await provider.callApi('test prompt');
      expect(result.error).toBe('API call error: API Error');
    });

    it('should handle invalid JSON response', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation()
        .mockResolvedValueOnce(
          createMockResponse({
            text: () => Promise.resolve('invalid json'),
            json: () => Promise.reject(new Error('Invalid JSON')),
          }),
        );

      const result = await provider.callApi('test prompt');
      expect(result.error).toContain('API call error: Invalid JSON');
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

      jest
        .spyOn(global, 'fetch')
        .mockImplementation()
        .mockResolvedValueOnce(
          createMockResponse({
            json: () => Promise.resolve(mockResponse),
          }),
        );

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
  });
});
