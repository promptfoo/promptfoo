import type Anthropic from '@anthropic-ai/sdk';
import { APIError } from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { clearCache, disableCache, enableCache, getCache } from '../../src/cache';
import {
  AnthropicCompletionProvider,
  AnthropicLlmRubricProvider,
  AnthropicMessagesProvider,
  calculateAnthropicCost,
  outputFromMessage,
  parseMessages,
} from '../../src/providers/anthropic';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('Anthropic', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('AnthropicMessagesProvider callApi', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
            },
          },
          required: ['location'],
        },
      },
    ];

    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
      config: { tools },
    });

    it('should use cache by default for ToolUse requests', async () => {
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
            },
            {
              type: 'tool_use',
              id: 'toolu_01A09q90qw90lq917835lq9',
              name: 'get_weather',
              input: { location: 'San Francisco, CA', unit: 'celsius' },
            },
          ],
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(
        1,
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  text: 'What is the forecast in San Francisco?',
                  type: 'text',
                },
              ],
            },
          ],
          tools,
          temperature: 0,
          stream: false,
        },
        {},
      );

      expect(result).toMatchObject({
        cost: undefined,
        output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

          {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
        tokenUsage: {},
      });

      const resultFromCache = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject(resultFromCache);
    });

    it('should pass the tool choice if specified', async () => {
      const toolChoice: Anthropic.MessageCreateParams.ToolChoiceTool = {
        name: 'get_weather',
        type: 'tool',
      };
      provider.config.tool_choice = toolChoice;
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
            },
            {
              type: 'tool_use',
              id: 'toolu_01A09q90qw90lq917835lq9',
              name: 'get_weather',
              input: { location: 'San Francisco, CA', unit: 'celsius' },
            },
          ],
        } as Anthropic.Messages.Message);

      await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(
        1,
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  text: 'What is the forecast in San Francisco?',
                  type: 'text',
                },
              ],
            },
          ],
          tools,
          tool_choice: toolChoice,
          temperature: 0,
          stream: false,
        },
        {},
      );

      provider.config.tool_choice = undefined;
    });

    it('should include extra_body parameters in API call', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: {
          extra_body: {
            top_p: 0.9,
            custom_param: 'test_value',
          },
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Test prompt' }],
            },
          ],
          temperature: 0,
          stream: false,
          top_p: 0.9,
          custom_param: 'test_value',
        },
        {},
      );
    });

    it('should not include extra_body when it is not an object', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: {
          extra_body: undefined,
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Test prompt' }],
            },
          ],
          temperature: 0,
          stream: false,
        },
        {},
      );
    });

    it('should not use cache if caching is disabled for ToolUse requests', async () => {
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
            },
            {
              type: 'tool_use',
              id: 'toolu_01A09q90qw90lq917835lq9',
              name: 'get_weather',
              input: { location: 'San Francisco, CA', unit: 'celsius' },
            },
          ],
        } as Anthropic.Messages.Message);

      disableCache();

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

          {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
        tokenUsage: {},
      });

      await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(2);
      enableCache();
    });

    it('should return cached response for legacy caching behavior', async () => {
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [],
        } as unknown as Anthropic.Messages.Message);

      const cacheKey =
        'anthropic:{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":[{"type":"text","text":"What is the forecast in San Francisco?"}]}],"stream":false,"temperature":0,"tools":[{"name":"get_weather","description":"Get the current weather in a given location","input_schema":{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"},"unit":{"type":"string","enum":["celsius","fahrenheit"]}},"required":["location"]}}]}';

      await getCache().set(cacheKey, 'Test output');

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(0);
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022');
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: API call failed',
      });
    });

    it('should handle non-Error API call errors', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022');
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockRejectedValue('Non-error object');

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: Non-error object',
      });
    });

    it('should handle APIError with error details', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022');

      const mockApiError = Object.create(APIError.prototype);
      Object.assign(mockApiError, {
        name: 'APIError',
        message: 'API Error',
        status: 400,
        error: {
          error: {
            message: 'Invalid request parameters',
            type: 'invalid_params',
          },
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockRejectedValue(mockApiError);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: Invalid request parameters, status 400, type invalid_params',
      });
    });

    it('should return token usage and cost', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { max_tokens: 100, temperature: 0.5, cost: 0.015 },
      });
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test output' }],
          usage: { input_tokens: 50, output_tokens: 50 },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
        cost: 1.5,
      });
    });

    it('should handle thinking configuration', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            {
              type: 'thinking',
              thinking: 'Let me analyze this step by step...',
              signature: 'test-signature',
            },
            {
              type: 'text',
              text: 'Final answer',
            },
          ],
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is 2+2?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'What is 2+2?' }],
            },
          ],
          stream: false,
          temperature: undefined,
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
        },
        {},
      );
      expect(result.output).toBe('Final answer');
      expect(result.reasoning).toBe(
        'Thinking: Let me analyze this step by step...\nSignature: test-signature',
      );
    });

    it('should handle redacted thinking blocks', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219');
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            {
              type: 'redacted_thinking',
              data: 'encrypted-data',
            },
            {
              type: 'text',
              text: 'Final answer',
            },
          ],
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is 2+2?');
      expect(result.output).toBe('Final answer');
      expect(result.reasoning).toBe('Redacted Thinking: encrypted-data');
      expect(result.reasoning).toBe('Redacted Thinking: encrypted-data');
    });

    it('should handle API errors for thinking configuration', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219');

      // Mock API error for invalid budget
      const mockApiError = Object.create(APIError.prototype);
      Object.assign(mockApiError, {
        name: 'APIError',
        message: 'API Error',
        status: 400,
        error: {
          error: {
            message: 'Thinking budget must be at least 1024 tokens when enabled',
            type: 'invalid_request_error',
          },
        },
      });

      jest.spyOn(provider.anthropic.messages, 'create').mockRejectedValue(mockApiError);

      const result = await provider.callApi(
        JSON.stringify([
          {
            role: 'user',
            content: 'test',
            thinking: {
              type: 'enabled',
              budget_tokens: 512,
            },
          },
        ]),
      );

      expect(result.error).toBe(
        'API call error: Thinking budget must be at least 1024 tokens when enabled, status 400, type invalid_request_error',
      );

      // Test budget exceeding max_tokens
      const providerWithMaxTokens = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          max_tokens: 2048,
        },
      });

      const mockMaxTokensError = Object.create(APIError.prototype);
      Object.assign(mockMaxTokensError, {
        name: 'APIError',
        message: 'API Error',
        status: 400,
        error: {
          error: {
            message: 'Thinking budget must be less than max_tokens',
            type: 'invalid_request_error',
          },
        },
      });

      jest
        .spyOn(providerWithMaxTokens.anthropic.messages, 'create')
        .mockRejectedValue(mockMaxTokensError);

      const result2 = await providerWithMaxTokens.callApi(
        JSON.stringify([
          {
            role: 'user',
            content: 'test',
            thinking: {
              type: 'enabled',
              budget_tokens: 3000,
            },
          },
        ]),
      );

      expect(result2.error).toBe(
        'API call error: Thinking budget must be less than max_tokens, status 400, type invalid_request_error',
      );
    });

    it('should respect explicit temperature when thinking is enabled', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
          temperature: 0.7,
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Test prompt' }],
            },
          ],
          stream: false,
          temperature: 0.7,
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
        },
        {},
      );
    });

    it('should include beta features header when specified', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          beta: ['output-128k-2025-02-19'],
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(expect.anything(), {
        headers: {
          'anthropic-beta': 'output-128k-2025-02-19',
        },
      });
    });

    it('should include multiple beta features in header', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          beta: ['output-128k-2025-02-19', 'another-beta-feature'],
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(expect.anything(), {
        headers: {
          'anthropic-beta': 'output-128k-2025-02-19,another-beta-feature',
        },
      });
    });
  });

  describe('AnthropicLlmRubricProvider', () => {
    let provider: AnthropicLlmRubricProvider;

    beforeEach(() => {
      provider = new AnthropicLlmRubricProvider('claude-3-5-sonnet-20241022');
    });

    it('should initialize with forced tool configuration', () => {
      expect(provider.modelName).toBe('claude-3-5-sonnet-20241022');
      expect(provider.config.tool_choice).toEqual({ type: 'tool', name: 'grade_output' });
    });

    it('should call API and parse the result correctly', async () => {
      const mockApiResponse = {
        output: JSON.stringify({
          type: 'tool_use',
          id: 'test-id',
          name: 'grade_output',
          input: {
            pass: true,
            score: 0.85,
            reason: 'The output meets the criteria.',
          },
        }),
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: {
          pass: true,
          score: 0.85,
          reason: 'The output meets the criteria.',
        },
      });
    });

    it('should handle non-string API response', async () => {
      const mockApiResponse = {
        output: { confession: 'I am not a string' },
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - malformed non-string output');
    });

    it('should handle malformed API response', async () => {
      const mockApiResponse = {
        output: 'Invalid JSON',
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - invalid JSON');
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockRejectedValue(mockError);

      await expect(provider.callApi('Test prompt')).rejects.toThrow('API Error');
    });
  });

  describe('AnthropicCompletionProvider callApi', () => {
    it('should return output for default behavior', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return cached output with caching enabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
      expect(cachedResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return fresh output with caching disabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();

      disableCache();

      const freshResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(freshResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest
        .spyOn(provider.anthropic.completions, 'create')
        .mockImplementation()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('Test prompt');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });
  });

  describe('calculateAnthropicCost', () => {
    it('should calculate cost for valid input and output tokens', () => {
      const cost = calculateAnthropicCost('claude-3-5-sonnet-20241022', { cost: 0.015 }, 100, 200);
      expect(cost).toBe(4.5); // (0.003 * 100) + (0.015 * 200)
    });

    it('should calculate cost for Claude 3.7 model', () => {
      const cost = calculateAnthropicCost('claude-3-7-sonnet-20250219', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.004 * 100) + (0.02 * 200)
    });

    it('should calculate cost for Claude 3.7 latest model', () => {
      const cost = calculateAnthropicCost('claude-3-7-sonnet-latest', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.004 * 100) + (0.02 * 200)
    });

    it('should return undefined for missing model', () => {
      const cost = calculateAnthropicCost('non-existent-model', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });

    it('should return undefined for missing tokens', () => {
      const cost = calculateAnthropicCost('claude-3-5-sonnet-20241022', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });
  });

  describe('outputFromMessage', () => {
    it('should return an empty string for empty content array', () => {
      const message: Anthropic.Messages.Message = {
        content: [],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('');
    });

    it('should return text from a single text block', () => {
      const message: Anthropic.Messages.Message = {
        content: [{ type: 'text', text: 'Hello', citations: [] }],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('Hello');
    });

    it('should concatenate text blocks without tool_use blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          { type: 'text', text: 'World', citations: [] },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('Hello\n\nWorld');
    });

    it('should handle content with tool_use blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'get_weather',
            input: { location: 'San Francisco, CA' },
          },
          {
            type: 'tool_use',
            id: 'tool2',
            name: 'get_time',
            input: { location: 'New York, NY' },
          },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe(
        '{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\n{"type":"tool_use","id":"tool2","name":"get_time","input":{"location":"New York, NY"}}',
      );
    });

    it('should concatenate text and tool_use blocks as JSON strings', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'get_weather',
            input: { location: 'San Francisco, CA' },
          },
          { type: 'text', text: 'World', citations: [] },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe(
        'Hello\n\n{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\nWorld',
      );
    });

    it('should handle text blocks with citations', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          {
            type: 'text',
            text: 'The sky is blue',
            citations: [
              {
                type: 'char_location',
                cited_text: 'The sky is blue.',
                document_index: 0,
                document_title: 'Nature Facts',
                start_char_index: 0,
                end_char_index: 15,
              },
            ],
          },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('The sky is blue');
    });

    it('should handle content without thinking blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'The sky is blue', citations: [] },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('The sky is blue');
      expect(result.reasoning).toBeUndefined();
    });

    it('should collect thinking blocks into reasoning field', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'thinking',
            thinking: 'I need to consider the weather',
            signature: 'abc123',
          },
          { type: 'text', text: 'World', citations: [] },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('Hello\n\nWorld');
      expect(result.reasoning).toBe('Thinking: I need to consider the weather\nSignature: abc123');
    });

    it('should collect redacted_thinking blocks into reasoning field', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'redacted_thinking',
            data: 'Some redacted thinking data',
          },
          { type: 'text', text: 'World', citations: [] },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result.output).toBe('Hello\n\nWorld');
      expect(result.reasoning).toBe('Redacted Thinking: Some redacted thinking data');
    });
  });

  describe('parseMessages', () => {
    it('should parse messages with user and assistant roles', () => {
      const inputMessages = dedent`user: What is the weather?
          assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny.' }],
        },
      ]);
    });

    it('should handle system messages', () => {
      const inputMessages = dedent`system: This is a system message.
        user: What is the weather?
        assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'This is a system message.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny.' }],
        },
      ]);
    });

    it('should handle empty input', () => {
      const inputMessages = '';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: '' }],
        },
      ]);
    });

    it('should handle only system message', () => {
      const inputMessages = 'system: This is a system message.';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'This is a system message.' }]);
      expect(extractedMessages).toEqual([]);
    });

    it('should handle messages with image content', () => {
      const inputMessages = dedent`user: Here's an image: [image-1.jpg]
        assistant: I see the image.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: "Here's an image: [image-1.jpg]" }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I see the image.' }],
        },
      ]);
    });

    it('should handle multiple messages of the same role', () => {
      const inputMessages = dedent`
        user: First question
        user: Second question
        assistant: Here's the answer`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'First question' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second question' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "Here's the answer" }],
        },
      ]);
    });

    it('should handle a single user message', () => {
      const inputMessages = 'Hello, Claude';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, Claude' }],
        },
      ]);
    });

    it('should handle multi-line messages', () => {
      const inputMessages = dedent`
        user: This is a
        multi-line
        message
        assistant: And this is a
        multi-line response`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'This is a\nmulti-line\nmessage' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'And this is a\nmulti-line response' }],
        },
      ]);
    });

    it('should parse JSON message array with image content', () => {
      const inputMessages = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);
    });

    it('should parse JSON message array with mixed content types', () => {
      const inputMessages = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
        { role: 'assistant', content: 'I see a beautiful landscape.' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'You are a helpful assistant.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I see a beautiful landscape.' }],
        },
      ]);
    });

    it('should handle system messages in JSON array format', () => {
      const inputMessages = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'You are a helpful assistant.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello!' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
      ]);
    });

    it('should handle system messages with array content in JSON format', () => {
      const inputMessages = JSON.stringify([
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: 'Additional system context.' },
          ],
        },
        { role: 'user', content: 'Hello!' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([
        { type: 'text', text: 'You are a helpful assistant.' },
        { type: 'text', text: 'Additional system context.' },
      ]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      ]);
    });
  });
});
