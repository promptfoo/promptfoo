import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('AzureChatCompletionProvider', () => {
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

    it('should pass custom headers from config to fetchWithCache', async () => {
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'test' } }],
          usage: {},
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const customHeaders = {
        'X-Test-Header': 'test-value',
        'Another-Header': 'another-value',
      };

      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiHost: 'test.azure.com',
          apiKey: 'test-key',
          headers: customHeaders,
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'api-key': 'test-key',
            'X-Test-Header': 'test-value',
            'Another-Header': 'another-value',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
      );
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

  describe('reasoning models', () => {
    it('should detect reasoning models with o1 flag', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          o1: true,
        },
      });
      expect((provider as any).isReasoningModel()).toBe(true);
    });

    it('should detect reasoning models with isReasoningModel flag', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          isReasoningModel: true,
        },
      });
      expect((provider as any).isReasoningModel()).toBe(true);
    });

    it('should detect reasoning models with either flag set', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          o1: false,
          isReasoningModel: true,
        },
      });
      expect((provider as any).isReasoningModel()).toBe(true);
    });

    it('should use max_completion_tokens for reasoning models', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          isReasoningModel: true,
          max_completion_tokens: 2000,
          max_tokens: 1000,
        },
      });
      const body = (provider as any).getOpenAiBody('test prompt').body;
      expect(body).toHaveProperty('max_completion_tokens', 2000);
      expect(body).not.toHaveProperty('max_tokens');
    });

    it('should use reasoning_effort for reasoning models', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          isReasoningModel: true,
          reasoning_effort: 'high',
        },
      });
      const body = (provider as any).getOpenAiBody('test prompt').body;
      expect(body).toHaveProperty('reasoning_effort', 'high');
    });

    it('should not include temperature for reasoning models', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          isReasoningModel: true,
          temperature: 0.7,
        },
      });
      const body = (provider as any).getOpenAiBody('test prompt').body;
      expect(body).not.toHaveProperty('temperature');
    });

    it('should support variable rendering in reasoning_effort', () => {
      const provider = new AzureChatCompletionProvider('test-deployment', {
        config: {
          isReasoningModel: true,
          reasoning_effort: '{{effort}}' as any,
          apiHost: 'test.azure.com',
        },
      });
      const context = {
        prompt: { label: 'test prompt', raw: 'test prompt' },
        vars: { effort: 'high' as const },
      };
      const body = (provider as any).getOpenAiBody('test prompt', context).body;
      expect(body).toHaveProperty('reasoning_effort', 'high');
    });
  });

  describe('guardrails and content filtering', () => {
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

    it('should detect output content filtering', async () => {
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
              content: 'Some content',
            },
            finish_reason: 'content_filter',
            content_filter_results: {
              hate: {
                filtered: false,
                severity: 'safe',
              },
              jailbreak: {
                filtered: false,
                detected: false,
              },
              self_harm: {
                filtered: false,
                severity: 'safe',
              },
              sexual: {
                filtered: false,
                severity: 'safe',
              },
              violence: {
                filtered: true,
                severity: 'medium',
              },
            },
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

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
      });
      expect(result.finishReason).toBe('content_filter');
    });

    it('should detect input content filtering', async () => {
      const mockResponse = {
        error: {
          message:
            "The response was filtered due to the prompt triggering Azure OpenAI's content management policy. Please modify your prompt and retry. To learn more about our content filtering policies please read our documentation: https://go.microsoft.com/fwlink/?linkid=2198766",
          type: null,
          param: 'prompt',
          code: 'content_filter',
          status: 400,
          innererror: {
            code: 'ResponsibleAIPolicyViolation',
            content_filter_result: {
              hate: {
                filtered: false,
                severity: 'safe',
              },
              jailbreak: {
                filtered: false,
                detected: false,
              },
              self_harm: {
                filtered: false,
                severity: 'safe',
              },
              sexual: {
                filtered: false,
                severity: 'safe',
              },
              violence: {
                filtered: true,
                severity: 'medium',
              },
            },
          },
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 400,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
      });
      expect(result.output).toBe(
        "The response was filtered due to the prompt triggering Azure OpenAI's content management policy. Please modify your prompt and retry. To learn more about our content filtering policies please read our documentation: https://go.microsoft.com/fwlink/?linkid=2198766",
      );
      expect(result.finishReason).toBe('content_filter');
    });

    it('should handle content filtering system errors', async () => {
      const mockResponse = {
        choices: [
          {
            content_filter_results: {
              error: {
                code: 'content_filter_error',
                message: 'The contents are not filtered',
              },
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              annotations: [],
              content: 'generated text',
              refusal: null,
              role: 'assistant',
            },
          },
        ],
        created: 1752095779,
        id: 'chatcmpl-BrWRHfgUxlkb7lRw5ESPuCcmCxFEa',
        model: 'gpt-4.1-nano-2025-04-14',
        object: 'chat.completion',
        prompt_filter_results: [
          {
            prompt_index: 0,
            content_filter_results: {
              hate: {
                filtered: false,
                severity: 'safe',
              },
              jailbreak: {
                filtered: false,
                detected: false,
              },
              self_harm: {
                filtered: false,
                severity: 'safe',
              },
              sexual: {
                filtered: false,
                severity: 'safe',
              },
              violence: {
                filtered: false,
                severity: 'safe',
              },
            },
          },
        ],
        system_fingerprint: 'fp_68472df8fd',
        usage: {
          completion_tokens: 37,
          completion_tokens_details: {
            accepted_prediction_tokens: 0,
            audio_tokens: 0,
            reasoning_tokens: 0,
            rejected_prediction_tokens: 0,
          },
          prompt_tokens: 19,
          prompt_tokens_details: {
            audio_tokens: 0,
            cached_tokens: 0,
          },
          total_tokens: 56,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.guardrails).toEqual({
        flagged: false,
        flaggedInput: false,
        flaggedOutput: false,
      });
      expect(result.output).toBe('generated text');
      expect(result.finishReason).toBe('stop');
      expect(logger.warn).toHaveBeenCalledWith(
        'Content filtering system is down or otherwise unable to complete the request in time: content_filter_error The contents are not filtered',
      );
    });

    it('should not flag when no content filtering is triggered', async () => {
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
              content: 'Some content',
            },
            finish_reason: 'stop',
            content_filter_results: {
              hate: { filtered: false, severity: 'safe' },
              sexual: { filtered: false, severity: 'safe' },
              violence: { filtered: false, severity: 'safe' },
              self_harm: { filtered: false, severity: 'safe' },
            },
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

      expect(result.finishReason).toBe('stop');
    });
  });

  describe('Function Tool Callbacks', () => {
    it('should execute function callbacks and return the result', async () => {
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
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'addNumbers',
                    arguments: '{"a": 5, "b": 6}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
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

      const providerWithCallbacks = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await providerWithCallbacks.callApi('Add 5 and 6');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('11');
    });

    it('should handle multiple function callbacks', async () => {
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
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'addNumbers',
                    arguments: '{"a": 5, "b": 6}',
                  },
                },
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'multiplyNumbers',
                    arguments: '{"a": 3, "b": 4}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
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

      const providerWithCallbacks = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a + b);
            },
            multiplyNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a * b);
            },
          },
        },
      });

      const result = await providerWithCallbacks.callApi('Add 5 and 6, then multiply 3 and 4');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('11\n12');
    });

    it('should fall back to raw function call when callback fails', async () => {
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
              function_call: {
                name: 'addNumbers',
                arguments: 'invalid json',
              },
            },
            finish_reason: 'function_call',
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

      const providerWithCallbacks = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args); // This will throw
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await providerWithCallbacks.callApi('Add numbers with invalid JSON');

      expect(result.error).toBeUndefined();
      // When callback fails, it returns the stringified function call
      expect(result.output).toBe('{"name":"addNumbers","arguments":"invalid json"}');
    });

    it('should handle legacy function_call format', async () => {
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
              function_call: {
                name: 'calculateSum',
                arguments: '{"numbers": [1, 2, 3, 4, 5]}',
              },
            },
            finish_reason: 'function_call',
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

      const providerWithCallbacks = new AzureChatCompletionProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: {
            calculateSum: async (args: string) => {
              const { numbers } = JSON.parse(args);
              const sum = numbers.reduce((a: number, b: number) => a + b, 0);
              return JSON.stringify(sum);
            },
          },
        },
      });

      const result = await providerWithCallbacks.callApi('Calculate sum of [1, 2, 3, 4, 5]');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('15');
    });
  });
});
