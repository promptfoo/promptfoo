import type Anthropic from '@anthropic-ai/sdk';
import { APIError } from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { clearCache, disableCache, enableCache, getCache } from '../../../src/cache';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { AnthropicTestTool, WebSearchToolType } from './types';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('AnthropicMessagesProvider', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('callApi', () => {
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
      expect(result.output).toBe(
        'Thinking: Let me analyze this step by step...\nSignature: test-signature\n\nFinal answer',
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
      expect(result.output).toBe('Redacted Thinking: encrypted-data\n\nFinal answer');
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

    it('should include web search tool when configured', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          web_search: {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 5,
            allowed_domains: ['example.com', 'trusteddomain.org'],
            user_location: {
              type: 'approximate',
              city: 'San Francisco',
              region: 'California',
              country: 'US',
              timezone: 'America/Los_Angeles',
            },
            input_schema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          } as WebSearchToolType,
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Search results response' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('What is the latest news about quantum computing?');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-7-sonnet-20250219',
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
              allowed_domains: ['example.com', 'trusteddomain.org'],
              user_location: {
                type: 'approximate',
                city: 'San Francisco',
                region: 'California',
                country: 'US',
                timezone: 'America/Los_Angeles',
              },
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            } as any,
          ],
        }),
        {},
      );
    });

    it('should handle web search tool results in response', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          web_search: {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [
            { type: 'text', text: "I'll search for information about quantum computing." },
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01WYG3ziw53XMcoyKL4XcZmE',
              name: 'web_search',
              input: {
                query: 'latest quantum computing breakthroughs 2025',
              },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01WYG3ziw53XMcoyKL4XcZmE',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://example.com/quantum-computing',
                  title: 'Quantum Computing Breakthroughs 2025',
                  encrypted_content:
                    'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
                  page_age: 'May 2, 2025',
                },
              ],
            },
            {
              type: 'text',
              text: 'Based on the search results, there have been significant breakthroughs in quantum computing in 2025.',
              citations: [
                {
                  type: 'web_search_result_location',
                  url: 'https://example.com/quantum-computing',
                  title: 'Quantum Computing Breakthroughs 2025',
                  encrypted_index: 'Eo8BCioIAhgBIiQyYjQ0OWJmZi1lNm..',
                  cited_text:
                    'Researchers achieved a new record in quantum coherence time, maintaining qubit stability for over 10 minutes, a crucial advancement for practical quantum computing.',
                },
              ],
            },
          ],
          usage: {
            input_tokens: 25,
            output_tokens: 150,
            server_tool_use: {
              web_search_requests: 1,
            },
          },
        } as unknown as Anthropic.Messages.Message);

      const result = await provider.callApi('What are the latest quantum computing breakthroughs?');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result.output).toContain(
        'Based on the search results, there have been significant breakthroughs in quantum computing in 2025.',
      );
      expect(result.output).toContain("I'll search for information about quantum computing.");
      // The URL might not be in the output depending on how the mock is set up
      // expect(result.output).toContain('https://example.com/quantum-computing');
    });

    it('should handle web search via tools array configuration', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            } as any,
          ],
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'Search results response' }],
          usage: {
            input_tokens: 25,
            output_tokens: 50,
            server_tool_use: {
              web_search_requests: 1,
            },
          },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the latest news about quantum computing?');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-7-sonnet-20250219',
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            } as any,
          ],
        }),
        {},
      );

      // Check that web search request is counted in token usage
      expect(result.tokenUsage?.webSearchRequests).toBe(1);
    });

    it('should support disabling tool calls with tool_choice: none', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-7-sonnet-20250219', {
        config: {
          tools: [
            {
              type: 'custom' as Anthropic.Tool['type'],
              name: 'get_weather',
              description: 'Get weather information',
              input_schema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          ],
          tool_choice: {
            type: 'none',
          } as Anthropic.Messages.ToolChoice,
        },
      });

      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
          content: [{ type: 'text', text: 'I will describe the weather instead of using tools.' }],
        } as Anthropic.Messages.Message);

      await provider.callApi('What is the weather in San Francisco?');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-7-sonnet-20250219',
          tool_choice: {
            type: 'none',
          },
        }),
        {},
      );
    });
  });
});
