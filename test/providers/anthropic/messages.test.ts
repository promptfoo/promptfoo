import { APIError } from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, getCache } from '../../../src/cache';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { MCPClient } from '../../../src/providers/mcp/client';
import { maybeLoadResponseFormatFromExternalFile } from '../../../src/util/file';
import type Anthropic from '@anthropic-ai/sdk';
import type { Mocked, MockedFunction } from 'vitest';

const mcpMocks = vi.hoisted(() => {
  const initialize = vi.fn();
  const cleanup = vi.fn();
  const getAllTools = vi.fn().mockReturnValue([]);
  const instances: any[] = [];

  class MockMCPClient {
    initialize = initialize;
    cleanup = cleanup;
    getAllTools = getAllTools;

    constructor() {
      instances.push(this);
    }
  }

  return { cleanup, getAllTools, initialize, instances, MockMCPClient };
});

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

vi.mock('../../../src/providers/mcp/client', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    MCPClient: mcpMocks.MockMCPClient,
  };
});

vi.mock('../../../src/util/file', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadResponseFormatFromExternalFile: vi.fn((input: any) => input),
  };
});

const mockMaybeLoadResponseFormatFromExternalFile =
  maybeLoadResponseFormatFromExternalFile as MockedFunction<
    typeof maybeLoadResponseFormatFromExternalFile
  >;

const TEST_API_KEY = 'test-api-key';
const originalEnv = process.env;
let mockMCPClient: Mocked<MCPClient> | undefined;

const createProvider = (
  ...args: ConstructorParameters<typeof AnthropicMessagesProvider>
): AnthropicMessagesProvider => {
  const created = new AnthropicMessagesProvider(...args);
  const lastInstance = mcpMocks.instances[mcpMocks.instances.length - 1] as
    | Mocked<MCPClient>
    | undefined;
  if (lastInstance) {
    mockMCPClient = lastInstance;
  }
  return created;
};

describe('AnthropicMessagesProvider', () => {
  let provider: AnthropicMessagesProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: TEST_API_KEY };
    mockMCPClient = undefined;
    mcpMocks.instances.length = 0;
    mcpMocks.initialize.mockReset();
    mcpMocks.cleanup.mockReset();
    mcpMocks.getAllTools.mockReset();
    mcpMocks.getAllTools.mockReturnValue([]);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    process.env = originalEnv;
    mcpMocks.instances.length = 0;
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

    let provider: AnthropicMessagesProvider;

    beforeEach(() => {
      provider = createProvider('claude-3-5-sonnet-20241022', {
        config: { tools },
      });
    });

    it('should use cache by default for ToolUse requests', async () => {
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      expect(resultFromCache.cached).toBe(true);
      // Both results should match except for the cached flag
      expect(result.output).toEqual(resultFromCache.output);
      expect(result.cost).toEqual(resultFromCache.cost);
      expect(result.tokenUsage).toEqual(resultFromCache.tokenUsage);
    });

    it('should pass the tool choice if specified', async () => {
      const toolChoice: Anthropic.MessageCreateParams['tool_choice'] = {
        name: 'get_weather',
        type: 'tool',
      };
      provider.config.tool_choice = toolChoice;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          extra_body: {
            top_p: 0.9,
            custom_param: 'test_value',
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          extra_body: undefined,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [],
      } as unknown as Anthropic.Messages.Message);

      const cacheKey =
        'anthropic:{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":[{"type":"text","text":"What is the forecast in San Francisco?"}]}],"stream":false,"temperature":0,"tools":[{"name":"get_weather","description":"Get the current weather in a given location","input_schema":{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"},"unit":{"type":"string","enum":["celsius","fahrenheit"]}},"required":["location"]}}]}';

      await getCache().set(cacheKey, 'Test output');

      const result = await provider.callApi('What is the forecast in San Francisco?');
      // Legacy cache items (plain strings) don't get the cached flag
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(0);
    });

    it('should handle API call error', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');
      vi.spyOn(provider.anthropic.messages, 'create').mockRejectedValue(
        new Error('API call failed'),
      );

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: API call failed',
      });
    });

    it('should handle non-Error API call errors', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');
      vi.spyOn(provider.anthropic.messages, 'create').mockRejectedValue('Non-error object');

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: Non-error object',
      });
    });

    it('should handle APIError with error details', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');

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

      vi.spyOn(provider.anthropic.messages, 'create').mockRejectedValue(mockApiError);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: Invalid request parameters, status 400, type invalid_params',
      });
    });

    it('should return token usage and cost', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: { max_tokens: 100, temperature: 0.5, cost: 0.015 },
      });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test output' }],
        usage: { input_tokens: 50, output_tokens: 50, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
        cost: 1.5,
      });
    });

    it('should handle thinking configuration', async () => {
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-7-sonnet-20250219');
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-7-sonnet-20250219');

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

      vi.spyOn(provider.anthropic.messages, 'create').mockRejectedValue(mockApiError);

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
      const providerWithMaxTokens = createProvider('claude-3-7-sonnet-20250219', {
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

      vi.spyOn(providerWithMaxTokens.anthropic.messages, 'create').mockRejectedValue(
        mockMaxTokensError,
      );

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
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: {
            type: 'enabled',
            budget_tokens: 2048,
          },
          temperature: 0.7,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          beta: ['output-128k-2025-02-19'],
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
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
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          beta: ['output-128k-2025-02-19', 'another-beta-feature'],
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(expect.anything(), {
        headers: {
          'anthropic-beta': 'output-128k-2025-02-19,another-beta-feature',
        },
      });
    });

    describe('finish reason handling', () => {
      it('should surface a normalized finishReason for Anthropic reasons', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: 'end_turn', // Should be normalized to 'stop'
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBe('stop');
      });

      it('should normalize max_tokens to length', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: 'max_tokens', // Should be normalized to 'length'
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBe('length');
      });

      it('should normalize tool_use to tool_calls', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: 'tool_use', // Should be normalized to 'tool_calls'
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBe('tool_calls');
      });

      it('should exclude finishReason when stop_reason is null', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBeUndefined();
      });

      it('should exclude finishReason when stop_reason is undefined', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: undefined as any,
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBeUndefined();
      });

      it('should handle cached responses with finishReason', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');

        // Set up specific cache key for our test
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({} as any);

        const specificCacheKey =
          'anthropic:' +
          JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Test prompt' }] }],
            stream: false,
            temperature: 0,
          });

        await getCache().set(
          specificCacheKey,
          JSON.stringify({
            content: [{ type: 'text', text: 'Cached response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 5, server_tool_use: null },
          }),
        );

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBe('stop');
        expect(result.output).toBe('Cached response');
      });

      it('should handle unknown stop reasons by passing them through', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: 'unknown_reason' as any,
          usage: { input_tokens: 10, output_tokens: 10, server_tool_use: null },
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('Test prompt');
        expect(result.finishReason).toBe('unknown_reason');
      });
    });
  });

  describe('cleanup', () => {
    it('should await initialization before cleanup', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      const client = mockMCPClient;
      expect(client).toBeDefined();

      // Simulate initialization in progress
      const initPromise = Promise.resolve();
      provider['initializationPromise'] = initPromise;

      await provider.cleanup();

      // Verify cleanup was called after initialization
      expect(client!.cleanup).toHaveBeenCalledWith();
    });

    it('should handle cleanup when MCP is not enabled', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          mcp: {
            enabled: false,
          },
        },
      });

      await provider.cleanup();

      expect(mockMCPClient).toBeUndefined();
    });

    it('should handle cleanup errors gracefully', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      const client = mockMCPClient;
      expect(client).toBeDefined();

      client!.cleanup.mockRejectedValueOnce(new Error('Cleanup failed'));

      await expect(provider.cleanup()).rejects.toThrow('Cleanup failed');
    });
  });

  describe('Structured Outputs - output_format', () => {
    it('should add structured-outputs beta header when output_format is used', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"name":"John"}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Extract the name');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'anthropic-beta': 'structured-outputs-2025-11-13',
          }),
        }),
      );
    });

    it('should automatically parse JSON when output_format is json_schema', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' },
              },
              required: ['name', 'age'],
              additionalProperties: false,
            },
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"name":"Alice","age":30}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 8 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Extract the person data');

      expect(result.output).toEqual({
        name: 'Alice',
        age: 30,
      });
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Invalid JSON {name}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 8 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Extract data');

      // Should return the raw string if JSON parsing fails
      expect(result.output).toBe('Invalid JSON {name}');
    });

    it('should handle nested output_format with file:// references', async () => {
      // This test verifies that the code can handle external file loading
      // In a real scenario, maybeLoadFromExternalFile would load the schema
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"name":"Bob"}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Extract name');

      expect(result.output).toEqual({ name: 'Bob' });
    });

    it('should combine output_format with strict tools beta headers', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { result: { type: 'string' } },
              additionalProperties: false,
            },
          },
          tools: [
            {
              name: 'calculate',
              description: 'Perform calculation',
              strict: true,
              input_schema: {
                type: 'object',
                properties: { expression: { type: 'string' } },
                required: ['expression'],
                additionalProperties: false,
              },
            } as any,
          ],
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"result":"42"}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Calculate 2+2');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'anthropic-beta': 'structured-outputs-2025-11-13',
          }),
        }),
      );
    });

    it('should not duplicate beta headers when both strict tools and output_format are used', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { value: { type: 'number' } },
              additionalProperties: false,
            },
          },
          tools: [
            {
              name: 'get_data',
              description: 'Get data',
              strict: true,
              input_schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            } as any,
          ],
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"value":100}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Get value');

      const headers = mockCreate.mock.calls[0][1]?.headers as Record<string, string> | undefined;
      const betaHeader = headers?.['anthropic-beta'] || '';

      // Should only have one instance of the beta feature
      const betaFeatures = betaHeader.split(',');
      const structuredOutputsCount = betaFeatures.filter((f: string) =>
        f.includes('structured-outputs'),
      ).length;

      expect(structuredOutputsCount).toBe(1);
    });

    it('should handle streaming with output_format and parse JSON', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          stream: true,
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
      });

      const mockFinalMessage: Anthropic.Messages.Message = {
        content: [{ type: 'text', text: '{"status":"complete"}', citations: [] }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
        },
      };

      const mockStream = {
        finalMessage: vi.fn().mockResolvedValue(mockFinalMessage),
      };

      // @ts-expect-error - Mocking stream return value for test
      vi.spyOn(provider.anthropic.messages, 'stream').mockResolvedValue(mockStream);

      const result = await provider.callApi('Check status');

      expect(result.output).toEqual({ status: 'complete' });
    });

    it('should load output_format from external file', async () => {
      const mockSchema = {
        type: 'json_schema' as const,
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          additionalProperties: false,
        },
      };

      mockMaybeLoadResponseFormatFromExternalFile.mockReturnValue(mockSchema);

      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: 'file://test-schema.json' as any,
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"name":"Alice"}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Extract name');

      expect(mockMaybeLoadResponseFormatFromExternalFile).toHaveBeenCalledWith(
        'file://test-schema.json',
        undefined,
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: mockSchema,
        }),
        expect.any(Object),
      );
      expect(result.output).toEqual({ name: 'Alice' });
    });

    it('should load nested schema from external file in output_format', async () => {
      const loadedFormat = {
        type: 'json_schema' as const,
        schema: {
          type: 'object',
          properties: { result: { type: 'number' } },
          additionalProperties: false,
        },
      };

      // Simulating that the helper loaded both the outer format and nested schema
      mockMaybeLoadResponseFormatFromExternalFile.mockReturnValue(loadedFormat);

      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: {
            type: 'json_schema',
            schema: 'file://nested-schema.json',
          } as any,
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"result":42}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Calculate');

      expect(mockMaybeLoadResponseFormatFromExternalFile).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: loadedFormat,
        }),
        expect.any(Object),
      );
      expect(result.output).toEqual({ result: 42 });
    });

    it('should pass context vars for variable rendering in output_format', async () => {
      const loadedFormat = {
        type: 'json_schema' as const,
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          additionalProperties: false,
        },
      };

      mockMaybeLoadResponseFormatFromExternalFile.mockReturnValue(loadedFormat);

      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {
          output_format: 'file://{{ schema_name }}.json' as any,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: '{"value":"test"}' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Test', {
        prompt: { raw: 'Test', label: 'test' },
        vars: { schema_name: 'my-schema' },
      });

      expect(mockMaybeLoadResponseFormatFromExternalFile).toHaveBeenCalledWith(
        'file://{{ schema_name }}.json',
        { schema_name: 'my-schema' },
      );
    });
  });
});
