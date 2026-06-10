import { APIError } from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, getCache } from '../../../src/cache';
import logger from '../../../src/logger';
import {
  getAnthropicAuthCacheNamespace,
  hashAnthropicCacheValue,
} from '../../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { MCPClient } from '../../../src/providers/mcp/client';
import { maybeLoadResponseFormatFromExternalFile } from '../../../src/util/file';
import { mockProcessEnv } from '../../util/utils';
import type Anthropic from '@anthropic-ai/sdk';
import type { Mocked, MockedFunction } from 'vitest';

type AnthropicUsageWithOutputDetails = NonNullable<Anthropic.Messages.Message['usage']> & {
  output_tokens_details?: { thinking_tokens?: number } | null;
};

type AnthropicTestMessage = Anthropic.Messages.Message & {
  usage: AnthropicUsageWithOutputDetails;
};

const mcpMocks = vi.hoisted(() => {
  const initialize = vi.fn();
  const cleanup = vi.fn();
  const getAllTools = vi.fn().mockReturnValue([]);
  const callTool = vi.fn();
  const instances: any[] = [];

  class MockMCPClient {
    initialize = initialize;
    cleanup = cleanup;
    getAllTools = getAllTools;
    callTool = callTool;

    constructor() {
      instances.push(this);
    }
  }

  return { callTool, cleanup, getAllTools, initialize, instances, MockMCPClient };
});

const claudeCodeAuthMocks = vi.hoisted(() => ({
  loadClaudeCodeCredential: vi.fn(),
}));

vi.mock('../../../src/providers/anthropic/claudeCodeAuth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadClaudeCodeCredential: claudeCodeAuthMocks.loadClaudeCodeCredential,
  };
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
const originalEnv = { ...process.env };
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

const anthropicCacheIdentityHash = () =>
  hashAnthropicCacheValue({
    apiBaseUrl: undefined,
  });

const anthropicMessagesCacheKey = (modelName: string, params: unknown) =>
  `anthropic:messages:${modelName}:${anthropicCacheIdentityHash()}:${getAnthropicAuthCacheNamespace(TEST_API_KEY)}:${hashAnthropicCacheValue(params)}`;

describe('AnthropicMessagesProvider', () => {
  let provider: AnthropicMessagesProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessEnv({ ...originalEnv, ANTHROPIC_API_KEY: TEST_API_KEY }, { clear: true });
    mockMCPClient = undefined;
    mcpMocks.instances.length = 0;
    mcpMocks.initialize.mockReset();
    mcpMocks.cleanup.mockReset();
    mcpMocks.callTool.mockReset();
    mcpMocks.getAllTools.mockReset();
    mcpMocks.getAllTools.mockReturnValue([]);
    claudeCodeAuthMocks.loadClaudeCodeCredential.mockReset();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    mockProcessEnv(originalEnv, { clear: true });
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

    it('should include top_p and top_k in API call when configured', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          top_p: 0.9,
          top_k: 40,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        top_p: 0.9,
        top_k: 40,
      });
      // Anthropic rejects temperature + top_p together, so temperature should be omitted
      expect(callArgs).not.toHaveProperty('temperature');
    });

    it('should suppress top_k when thinking is enabled', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          top_k: 40,
          thinking: { type: 'enabled', budget_tokens: 5000 },
          max_tokens: 8000,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      // top_k should be suppressed when thinking is enabled
      expect(callArgs).not.toHaveProperty('top_k');
      expect(callArgs).toHaveProperty('thinking');
    });

    it('should preserve non-thinking parameters when thinking is explicitly disabled', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          thinking: { type: 'disabled' },
          top_k: 40,
          temperature: 0.7,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        max_tokens: 1024,
        temperature: 0.7,
        thinking: { type: 'disabled' },
        top_k: 40,
      });
    });

    it('should include cache_control in API call when configured', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          cache_control: { type: 'ephemeral' },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cache_control: { type: 'ephemeral' },
        }),
        {},
      );
    });

    it('should include stop_sequences in API call when configured', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          stop_sequences: ['\n\nHuman:', 'STOP'],
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stop_sequences: ['\n\nHuman:', 'STOP'],
        }),
        {},
      );
    });

    it('should include metadata in API call when configured', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          metadata: { user_id: 'user-123' },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { user_id: 'user-123' },
        }),
        {},
      );
    });

    it('should ignore metadata when deriving the cache key', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          metadata: { user_id: 'user-123' },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      provider.config.metadata = { user_id: 'user-456' };
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult.output).toBe('Test response');
    });

    it('should hash request params in cache keys', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Sensitive prompt sk-ant-secret');

      const cacheKey = getSpy.mock.calls[0]?.[0] as string;
      expect(cacheKey).toMatch(
        /^anthropic:messages:claude-3-5-sonnet-20241022:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('Sensitive prompt');
      expect(cacheKey).not.toContain('sk-ant-secret');
      expect(setSpy).toHaveBeenCalledWith(cacheKey, expect.any(String));
    });

    it('should isolate hashed cache keys by resolved API key', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-b' },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get').mockResolvedValue(undefined);
      vi.spyOn(cache, 'set').mockResolvedValue(undefined);
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).toMatch(
        /^anthropic:messages:claude-3-5-sonnet-20241022:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyB).toMatch(
        /^anthropic:messages:claude-3-5-sonnet-20241022:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toBe(cacheKeyB);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('Shared sensitive prompt');
        expect(cacheKey).not.toContain('sk-ant-tenant-a');
        expect(cacheKey).not.toContain('sk-ant-tenant-b');
      }
    });

    it('should include beta request headers in hashed cache keys without leaking them', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          beta: ['web-search-2025-03-05'],
        },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          beta: ['web-fetch-2025-09-10'],
        },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).toMatch(
        /^anthropic:messages:claude-3-5-sonnet-20241022:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyB).toMatch(
        /^anthropic:messages:claude-3-5-sonnet-20241022:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toBe(cacheKeyB);
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('Shared sensitive prompt');
        expect(cacheKey).not.toContain('web-search-2025-03-05');
        expect(cacheKey).not.toContain('web-fetch-2025-09-10');
      }
    });

    it('should hash custom request header values into cache keys without leaking them', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          headers: {
            'x-api-key': 'sk-ant-header-a',
          },
        },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          headers: {
            'x-api-key': 'sk-ant-header-b',
          },
        },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get').mockResolvedValue(undefined);
      vi.spyOn(cache, 'set').mockResolvedValue(undefined);
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).not.toBe(cacheKeyB);
      expect(cacheKeyA).not.toContain('Shared sensitive prompt');
      expect(cacheKeyA).not.toContain('sk-ant-header-a');
      expect(cacheKeyA).not.toContain('sk-ant-header-b');
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should preserve duplicate-case request headers in cache keys', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          headers: {
            'X-API-Key': 'sk-ant-header-a',
            'x-api-key': 'sk-ant-header-b',
          },
        },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          headers: {
            'X-API-Key': 'sk-ant-header-a',
            'x-api-key': 'sk-ant-header-c',
          },
        },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get').mockResolvedValue(undefined);
      vi.spyOn(cache, 'set').mockResolvedValue(undefined);
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).not.toBe(cacheKeyB);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('Shared sensitive prompt');
        expect(cacheKey).not.toContain('sk-ant-header-a');
        expect(cacheKey).not.toContain('sk-ant-header-b');
        expect(cacheKey).not.toContain('sk-ant-header-c');
      }
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should avoid logging prompts and generated outputs in debug metadata', async () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Generated secret response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Sensitive prompt with sk-ant-secret');

      const debugLogs = JSON.stringify(debugSpy.mock.calls);
      expect(debugLogs).not.toContain('Sensitive prompt');
      expect(debugLogs).not.toContain('sk-ant-secret');
      expect(debugLogs).not.toContain('Generated secret response');
      debugSpy.mockRestore();
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

    it('should return cached plain-string responses', async () => {
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [],
      } as unknown as Anthropic.Messages.Message);

      const cacheKey = anthropicMessagesCacheKey('claude-3-5-sonnet-20241022', {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the forecast in San Francisco?' }],
          },
        ],
        stream: false,
        temperature: 0,
        tools,
      });

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

    it('should handle adaptive thinking configuration', async () => {
      const provider = createProvider('claude-opus-4-6', {
        config: {
          thinking: {
            type: 'adaptive',
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [
          {
            type: 'thinking',
            thinking: 'Let me think adaptively...',
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
          model: 'claude-opus-4-6',
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
            type: 'adaptive',
          },
        },
        {},
      );
      expect(result.output).toBe(
        'Thinking: Let me think adaptively...\nSignature: test-signature\n\nFinal answer',
      );
    });

    it('should handle adaptive thinking without budget_tokens', async () => {
      const provider = createProvider('claude-opus-4-6', {
        config: {
          thinking: {
            type: 'adaptive',
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Quick response without thinking',
          },
        ],
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Hello');
      expect(result.output).toBe('Quick response without thinking');
    });

    it('should omit explicit temperature when thinking is enabled', async () => {
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
      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      // Anthropic docs: temperature is incompatible with extended thinking
      expect(callArgs).not.toHaveProperty('temperature');
      expect(callArgs).toHaveProperty('thinking');
    });

    it('should clamp top_p to [0.95, 1.0] when thinking is enabled', async () => {
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: { type: 'enabled', budget_tokens: 2048 },
          top_p: 0.5,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      expect(callArgs).toMatchObject({ top_p: 0.95 });
      expect(callArgs).not.toHaveProperty('temperature');
    });

    it('should not clamp top_p when thinking is explicitly disabled', async () => {
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: { type: 'disabled' },
          top_p: 0.5,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        top_p: 0.5,
      });
    });

    it('should suppress forced tool_choice when thinking is enabled', async () => {
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: { type: 'enabled', budget_tokens: 2048 },
          tool_choice: 'required' as any,
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              input_schema: { type: 'object' as const, properties: {} },
            },
          ],
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      // Forced tool use (type: 'any' from 'required') is incompatible with thinking
      expect(callArgs).not.toHaveProperty('tool_choice');
    });

    it('should allow tool_choice none when thinking is enabled', async () => {
      const provider = createProvider('claude-3-7-sonnet-20250219', {
        config: {
          thinking: { type: 'enabled', budget_tokens: 2048 },
          tool_choice: 'none',
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              input_schema: { type: 'object' as const, properties: {} },
            },
          ],
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');
      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        tool_choice: { type: 'none' },
      });
    });

    it('should omit temperature when both temperature and top_p are set', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: {
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      const callArgs = vi.mocked(provider.anthropic.messages.create).mock.calls[0][0];
      // temperature must be omitted (Anthropic rejects temperature + top_p)
      expect(callArgs).not.toHaveProperty('temperature');
      expect(callArgs).toMatchObject({ top_p: 0.9 });
    });

    it('should forward cache tokens to cost calculation and token usage', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 50,
          output_tokens: 20,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 30,
          server_tool_use: null,
        },
      } as unknown as Anthropic.Messages.Message);

      const result = await provider.callApi('Test prompt');

      // Verify token usage includes cache tokens
      expect(result.tokenUsage).toMatchObject({
        prompt: 180, // 50 + 100 + 30
        completion: 20,
        total: 200, // 180 + 20
        completionDetails: {
          cacheReadInputTokens: 100,
          cacheCreationInputTokens: 30,
        },
      });

      // Verify cost is calculated (should be defined for known model)
      expect(result.cost).toBeDefined();
      expect(typeof result.cost).toBe('number');
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should forward cache tokens from cached responses', async () => {
      const provider = createProvider('claude-3-5-sonnet-20241022');

      // First call populates cache
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Cached response' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 50,
          output_tokens: 20,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 0,
          server_tool_use: null,
        },
      } as unknown as Anthropic.Messages.Message);

      await provider.callApi('Cache test prompt');

      // Second call should return cached response with cache-aware cost
      const cachedResult = await provider.callApi('Cache test prompt');
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult.cost).toBeDefined();
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

        const specificCacheKey = anthropicMessagesCacheKey('claude-3-5-sonnet-20241022', {
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

  describe('MCP tool execution', () => {
    const mcpTool = {
      name: 'search_companies',
      description: 'Search sample company records.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    };

    beforeEach(() => {
      disableCache();
      mcpMocks.getAllTools.mockReturnValue([mcpTool]);
    });

    afterEach(() => {
      enableCache();
    });

    it('executes MCP tool_use blocks and continues the Anthropic conversation with tool_result', async () => {
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

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar and Gridwise.',
      });

      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_search',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar and Gridwise match your query.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 7, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      expect(result.output).toBe('Acme Solar and Gridwise match your query.');
      expect(result.finishReason).toBe('stop');
      expect(result.tokenUsage).toMatchObject({
        prompt: 17,
        completion: 9,
        total: 26,
      });
      expect(mcpMocks.callTool).toHaveBeenCalledWith('search_companies', {
        query: 'clean energy',
      });
      expect(createSpy).toHaveBeenCalledTimes(2);

      const secondRequest = createSpy.mock.calls[1][0] as Anthropic.Messages.MessageCreateParams;
      expect(secondRequest.messages.slice(-2)).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_search',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_search',
              content: 'Found Acme Solar and Gridwise.',
            },
          ],
        },
      ]);
    });

    it('sums thinking tokens across MCP continuation rounds', async () => {
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

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar and Gridwise.',
      });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_search',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            output_tokens_details: { thinking_tokens: 3 },
            server_tool_use: null,
          },
        } as unknown as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar and Gridwise match your query.' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 7,
            output_tokens: 4,
            output_tokens_details: { thinking_tokens: 2 },
            server_tool_use: null,
          },
        } as unknown as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      // Reasoning must aggregate like output_tokens does, not report the last round only
      expect(result.tokenUsage).toMatchObject({
        prompt: 17,
        completion: 9,
        total: 26,
        completionDetails: { reasoning: 5 },
      });
    });

    it('does not cache MCP continuation results by default', async () => {
      enableCache();
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

      mcpMocks.callTool.mockResolvedValue({
        content: 'Fresh tool output.',
      });

      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_first_cache',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'First fresh answer.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 7, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_second_cache',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 11, output_tokens: 6, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Second fresh answer.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 8, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message);
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');

      const firstResult = await provider.callApi('Find clean energy companies');
      const secondResult = await provider.callApi('Find clean energy companies');

      expect(firstResult.output).toBe('First fresh answer.');
      expect(secondResult.output).toBe('Second fresh answer.');
      expect(createSpy).toHaveBeenCalledTimes(4);
      expect(mcpMocks.callTool).toHaveBeenCalledTimes(2);
      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('leaves mixed MCP and non-MCP tool_use blocks on the existing output path', async () => {
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

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_search',
            name: 'search_companies',
            input: { query: 'clean energy' },
          },
          {
            type: 'tool_use',
            id: 'toolu_weather',
            name: 'get_weather',
            input: { location: 'San Francisco' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find companies and weather');

      expect(mcpMocks.callTool).not.toHaveBeenCalled();
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result.finishReason).toBe('tool_calls');
      expect(result.output).toContain('"name":"search_companies"');
      expect(result.output).toContain('"name":"get_weather"');
    });

    it('drops forced tool_choice on MCP continuation requests', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          tool_choice: 'required' as any,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar.',
      });

      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_required',
              name: 'search_companies',
              input: { query: 'solar' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar is a match.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 7, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find solar companies');

      expect(result.output).toBe('Acme Solar is a match.');
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(createSpy.mock.calls[0][0]).toMatchObject({
        tool_choice: { type: 'any' },
      });
      expect(createSpy.mock.calls[1][0]).not.toHaveProperty('tool_choice');
    });

    it.each([
      {
        label: 'isError result with content',
        mcpResult: { content: 'lookup failed', isError: true },
        expectedContent: 'MCP Tool Error (search_companies): lookup failed',
      },
      {
        label: 'thrown error surfaced via the error field',
        mcpResult: { content: '', error: 'lookup failed' },
        expectedContent: 'MCP Tool Error (search_companies): lookup failed',
      },
      {
        label: 'error result without content',
        mcpResult: { content: '', isError: true },
        expectedContent: 'MCP Tool Error (search_companies): Tool returned an error result',
      },
    ])('marks MCP tool_result blocks as errors before continuing the Anthropic conversation ($label)', async ({
      mcpResult,
      expectedContent,
    }) => {
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

      mcpMocks.callTool.mockResolvedValueOnce(mcpResult);

      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_error',
              name: 'search_companies',
              input: { query: 'grid storage' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'I could not complete that lookup.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 7, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find grid storage companies');

      expect(result.output).toBe('I could not complete that lookup.');
      const secondRequest = createSpy.mock.calls[1][0] as Anthropic.Messages.MessageCreateParams;
      expect(secondRequest.messages.slice(-1)).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_error',
              content: expectedContent,
              is_error: true,
            },
          ],
        },
      ]);
    });

    it('leaves non-MCP Anthropic tool_use blocks on the existing output path', async () => {
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

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_weather',
            name: 'get_weather',
            input: { location: 'San Francisco' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the weather?');

      expect(mcpMocks.callTool).not.toHaveBeenCalled();
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result.finishReason).toBe('tool_calls');
      expect(result.output).toContain('"name":"get_weather"');
    });

    it('returns an error when MCP tool execution exceeds max_tool_calls', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          max_tool_calls: 1,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      mcpMocks.callTool.mockResolvedValue({
        content: 'Still needs another lookup.',
      });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_first',
              name: 'search_companies',
              input: { query: 'clean energy' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_second',
              name: 'search_companies',
              input: { query: 'solar' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 8, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      expect(result.error).toContain('Anthropic MCP tool execution exceeded max_tool_calls=1');
      expect(result.tokenUsage).toMatchObject({
        prompt: 18,
        completion: 9,
        total: 27,
      });
      // Cost should still be tracked even when the loop cap aborts the eval —
      // tokens were spent across both rounds.
      expect(result.cost).toBeGreaterThan(0);
    });

    it('disables MCP tool execution when max_tool_calls is 0', async () => {
      // Regression: max_tool_calls: 0 is an explicit "do not auto-execute MCP
      // tools" guard, but 0 was treated as invalid and silently widened to the
      // default of 8, so tools ran anyway.
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          max_tool_calls: 0,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_search',
            name: 'search_companies',
            input: { query: 'clean energy' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      // No tool was executed and no continuation request was made.
      expect(mcpMocks.callTool).not.toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalledTimes(1);
      // The initial response is returned on the normal output path, not as an error.
      expect(result.error).toBeUndefined();
      expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 5 });
    });

    it('blocks parallel MCP tool execution when it would exceed max_tool_calls', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          max_tool_calls: 1,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_first',
            name: 'search_companies',
            input: { query: 'solar' },
          },
          {
            type: 'tool_use',
            id: 'toolu_second',
            name: 'search_companies',
            input: { query: 'wind' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      expect(result.error).toContain('Anthropic MCP tool execution exceeded max_tool_calls=1');
      expect(mcpMocks.callTool).not.toHaveBeenCalled();
      expect(result.cost).toBeGreaterThan(0);
    });

    it('continues MCP tool execution through the streaming path', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          stream: true,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar.',
      });

      const streamSpy = vi
        .spyOn(provider.anthropic.messages, 'stream')
        .mockResolvedValueOnce({
          finalMessage: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'tool_use',
                id: 'toolu_stream',
                name: 'search_companies',
                input: { query: 'solar' },
              },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
          } as Anthropic.Messages.Message),
        } as any)
        .mockResolvedValueOnce({
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Acme Solar is a match.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 7, output_tokens: 4, server_tool_use: null },
          } as Anthropic.Messages.Message),
        } as any);

      const result = await provider.callApi('Find solar companies');

      expect(result.output).toBe('Acme Solar is a match.');
      expect(streamSpy).toHaveBeenCalledTimes(2);
      const secondRequest = streamSpy.mock.calls[1][0] as Anthropic.Messages.MessageCreateParams;
      expect(secondRequest.messages.slice(-1)).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_stream',
              content: 'Found Acme Solar.',
            },
          ],
        },
      ]);
    });

    it('returns a streaming error once further MCP execution exceeds max_tool_calls', async () => {
      provider = createProvider('claude-3-5-sonnet-latest', {
        config: {
          max_tool_calls: 1,
          stream: true,
          mcp: {
            enabled: true,
            server: {
              command: 'npm',
              args: ['start'],
            },
          },
        },
      });

      mcpMocks.callTool.mockResolvedValue({
        content: 'Still needs another lookup.',
      });

      vi.spyOn(provider.anthropic.messages, 'stream')
        .mockResolvedValueOnce({
          finalMessage: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'tool_use',
                id: 'toolu_stream_first',
                name: 'search_companies',
                input: { query: 'solar' },
              },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
          } as Anthropic.Messages.Message),
        } as any)
        .mockResolvedValueOnce({
          finalMessage: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'tool_use',
                id: 'toolu_stream_second',
                name: 'search_companies',
                input: { query: 'wind' },
              },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 8, output_tokens: 4, server_tool_use: null },
          } as Anthropic.Messages.Message),
        } as any);

      const result = await provider.callApi('Find clean energy companies');

      expect(result.error).toContain('Anthropic MCP tool execution exceeded max_tool_calls=1');
      expect(mcpMocks.callTool).toHaveBeenCalledTimes(1);
      expect(result.tokenUsage).toMatchObject({
        prompt: 18,
        completion: 9,
        total: 27,
      });
      expect(result.cost).toBeGreaterThan(0);
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
        stop_details: null,
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Extract the name');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_config: {
            format: {
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

      const mockFinalMessage: AnthropicTestMessage = {
        content: [{ type: 'text', text: '{"status":"complete"}', citations: [] }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_details: null,
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        container: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
          inference_geo: null,
          output_tokens_details: null,
        },
      };

      const mockStream = {
        finalMessage: vi.fn().mockResolvedValue(mockFinalMessage),
      };

      vi.spyOn(provider.anthropic.messages, 'stream').mockResolvedValue(mockStream as any);

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
          output_config: { format: mockSchema },
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
          output_config: { format: loadedFormat },
        }),
        expect.any(Object),
      );
      expect(result.output).toEqual({ result: 42 });
    });

    it('should pass effort in output_config when set with output_format', async () => {
      const provider = createProvider('claude-opus-4-6', {
        config: {
          effort: 'high',
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
        model: 'claude-opus-4-6',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Extract the name');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_config: {
            format: {
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
            effort: 'high',
          },
        }),
        expect.any(Object),
      );
    });

    it('should pass effort alone in output_config without output_format', async () => {
      const provider = createProvider('claude-opus-4-6', {
        config: {
          effort: 'low',
        },
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Quick response' }],
        id: 'msg_123',
        model: 'claude-opus-4-6',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Hello');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_config: {
            effort: 'low',
          },
        }),
        {},
      );
    });

    it('should not include output_config when neither effort nor output_format is set', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', {
        config: {},
      });

      const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test' }],
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Hello');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('output_config');
    });

    it('should support all effort levels', async () => {
      for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
        const provider = createProvider('claude-opus-4-6', {
          config: { effort },
        });

        const mockCreate = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
          id: 'msg_123',
          model: 'claude-opus-4-6',
          role: 'assistant',
          stop_reason: 'end_turn',
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 10, output_tokens: 5 },
        } as Anthropic.Messages.Message);

        await provider.callApi('Hello');

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            output_config: { effort },
          }),
          {},
        );
      }
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

  describe('temperature: 0 handling', () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Test output' }],
      model: 'claude-sonnet-4-6',
      id: 'test-id',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Anthropic.Messages.Message;

    it('should send temperature: 0 to the API when explicitly configured', async () => {
      const provider = createProvider('claude-sonnet-4-6', {
        config: { temperature: 0 },
      });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        }),
        {},
      );
    });

    it('should use provider-scoped env temperature when config temperature is not set', async () => {
      const provider = createProvider('claude-sonnet-4-6', {
        config: {},
        env: { ANTHROPIC_TEMPERATURE: '0.42' },
      });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.42,
        }),
        {},
      );
    });

    it('should use provider-scoped env temperature: 0 when config temperature is not set', async () => {
      const provider = createProvider('claude-sonnet-4-6', {
        config: {},
        env: { ANTHROPIC_TEMPERATURE: '0' },
      });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        }),
        {},
      );
    });

    it('should prefer config temperature over provider-scoped env', async () => {
      const provider = createProvider('claude-sonnet-4-6', {
        config: { temperature: 0.1 },
        env: { ANTHROPIC_TEMPERATURE: '0.9' },
      });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.1,
        }),
        {},
      );
    });
  });

  describe('Opus 4.6 prefill warning', () => {
    it('should warn when assistant prefilling is used with claude-opus-4-6', async () => {
      const provider = createProvider('claude-opus-4-6', { config: {} });
      const mockResp = {
        content: [{ type: 'text', text: 'Output' }],
        model: 'claude-opus-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi(
        JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'I will' },
        ]),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Assistant message prefilling is not supported on Claude Opus 4.6'),
      );
    });

    it('should not warn for non-Opus 4.6 models with prefilling', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: {} });
      const mockResp = {
        content: [{ type: 'text', text: 'Output' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi(
        JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'I will' },
        ]),
      );

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Assistant message prefilling is not supported'),
      );
    });
  });

  describe('Opus 4.7 temperature handling', () => {
    const mockResp = {
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-opus-4-7',
      id: 'test-id',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Anthropic.Messages.Message;

    it('omits temperature entirely for Opus 4.7 (no explicit config)', async () => {
      const provider = createProvider('claude-opus-4-7', { config: {} });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
    });

    it('omits temperature and warns when explicitly set on Opus 4.7', async () => {
      const provider = createProvider('claude-opus-4-7', { config: { temperature: 0.5 } });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7'),
      );
    });

    it('omits temperature when config.temperature is 0 on Opus 4.7', async () => {
      const provider = createProvider('claude-opus-4-7', { config: { temperature: 0 } });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7'),
      );
    });

    it('warns once per provider when called multiple times on Opus 4.7', async () => {
      const provider = createProvider('claude-opus-4-7', { config: { temperature: 0.5 } });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');
      await provider.callApi('Hello again');
      await provider.callApi('Hello once more');

      const warnings = warnSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('temperature is deprecated on Claude Opus 4.7'),
      );
      expect(warnings).toHaveLength(1);
    });

    it('warns on Opus 4.7 when temperature set via env override', async () => {
      const provider = createProvider('claude-opus-4-7', {
        config: {},
        env: { ANTHROPIC_TEMPERATURE: '0.3' },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7'),
      );
    });

    it('still sends temperature on Opus 4.6 (regression)', async () => {
      const provider = createProvider('claude-opus-4-6', { config: { temperature: 0 } });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-4-6' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).toHaveProperty('temperature', 0);
    });
  });

  describe('Opus 4.8 temperature handling', () => {
    const mockResp = {
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-opus-4-8',
      id: 'test-id',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Anthropic.Messages.Message;

    it('omits temperature entirely for Opus 4.8 (no explicit config)', async () => {
      const provider = createProvider('claude-opus-4-8', { config: {} });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
    });

    it('omits temperature and warns when explicitly set on Opus 4.8', async () => {
      const provider = createProvider('claude-opus-4-8', { config: { temperature: 0.5 } });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7 and 4.8'),
      );
    });

    it('omits temperature when config.temperature is 0 on Opus 4.8', async () => {
      const provider = createProvider('claude-opus-4-8', { config: { temperature: 0 } });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7 and 4.8'),
      );
    });

    it('warns once per provider when called multiple times on Opus 4.8', async () => {
      const provider = createProvider('claude-opus-4-8', { config: { temperature: 0.5 } });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');
      await provider.callApi('Hello again');
      await provider.callApi('Hello once more');

      const warnings = warnSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('temperature is deprecated on Claude Opus 4.7 and 4.8'),
      );
      expect(warnings).toHaveLength(1);
    });

    it('warns on Opus 4.8 when temperature set via env override', async () => {
      const provider = createProvider('claude-opus-4-8', {
        config: {},
        env: { ANTHROPIC_TEMPERATURE: '0.3' },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7 and 4.8'),
      );
    });

    it('omits top_p and top_k for Opus 4.8 (rejected sampling params)', async () => {
      const provider = createProvider('claude-opus-4-8', { config: { top_p: 0.9, top_k: 40 } });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
      expect(params).not.toHaveProperty('temperature');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 4.7 and 4.8'),
      );
    });

    it('still sends top_p and top_k on Opus 4.6 (regression)', async () => {
      const provider = createProvider('claude-opus-4-6', { config: { top_p: 0.9, top_k: 40 } });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-4-6' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).toHaveProperty('top_p', 0.9);
      expect(params).toHaveProperty('top_k', 40);
    });

    it('converts manual thinking to adaptive on Opus 4.8 (migrated config)', async () => {
      const provider = createProvider('claude-opus-4-8', {
        config: { thinking: { type: 'enabled', budget_tokens: 5000 }, max_tokens: 10000 },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: { type?: string; budget_tokens?: number };
      };
      // Manual budget-based thinking 400s on Opus 4.8 — it must be rewritten to adaptive.
      expect(params.thinking?.type).toBe('adaptive');
      expect(params.thinking?.budget_tokens).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Manual extended thinking'));
    });

    it('preserves manual thinking on Opus 4.6 (regression)', async () => {
      const provider = createProvider('claude-opus-4-6', {
        config: { thinking: { type: 'enabled', budget_tokens: 5000 }, max_tokens: 10000 },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-4-6' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: { type?: string; budget_tokens?: number };
      };
      expect(params.thinking?.type).toBe('enabled');
      expect(params.thinking?.budget_tokens).toBe(5000);
    });
  });

  describe('refusal stop_details handling', () => {
    it('should include guardrails in response when stop_reason is refusal', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: {} });
      const refusalResponse = {
        content: [{ type: 'text', text: '' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'refusal',
        stop_details: {
          type: 'refusal',
          category: 'cyber',
          explanation: 'Request involves prohibited activities',
        },
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 0 },
      } as unknown as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(refusalResponse);

      const result = await provider.callApi('How to hack a system');

      expect(result.guardrails).toEqual({
        flagged: true,
        reason: expect.stringContaining('category: cyber'),
      });
      expect(result.finishReason).toBe('content_filter');
    });

    it('should not include guardrails for non-refusal responses', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: {} });
      const normalResponse = {
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(normalResponse);

      const result = await provider.callApi('Hello');

      expect(result.guardrails).toBeUndefined();
    });

    it('should include guardrails in cached response when stop_reason is refusal', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: {} });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [],
      } as unknown as Anthropic.Messages.Message);

      // Manually populate cache with a refusal response (like the existing legacy cache test pattern)
      const refusalMessage = {
        content: [{ type: 'text', text: '' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'refusal',
        stop_details: {
          type: 'refusal',
          category: 'cyber',
          explanation: 'Prohibited content',
        },
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 0 },
      };
      const cacheKey = anthropicMessagesCacheKey('claude-sonnet-4-6', {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hack something' }] }],
        stream: false,
        temperature: 0,
      });
      const cache = await getCache();
      await cache.set(cacheKey, JSON.stringify(refusalMessage));

      const result = await provider.callApi('Hack something');
      expect(result.cached).toBe(true);
      expect(result.guardrails).toEqual({
        flagged: true,
        reason: expect.stringContaining('category: cyber'),
      });
    });

    it('should include guardrails in streaming response when stop_reason is refusal', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: { stream: true } });
      const refusalResponse = {
        content: [{ type: 'text', text: '' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'refusal',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 0 },
      } as unknown as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'stream').mockReturnValue({
        finalMessage: vi.fn().mockResolvedValue(refusalResponse),
        on: vi.fn((_event, listener) => {
          listener({
            type: 'message_delta',
            delta: {
              stop_details: {
                type: 'refusal',
                category: 'bio',
                explanation: null,
              },
            },
          } as Anthropic.Messages.MessageStreamEvent);
        }),
      } as any);

      const result = await provider.callApi('Dangerous request');

      expect(result.guardrails).toEqual({
        flagged: true,
        reason: expect.stringContaining('category: bio'),
      });
    });
  });

  describe('claude-mythos-preview model', () => {
    it('should accept claude-mythos-preview as a valid model without warning', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const provider = createProvider('claude-mythos-preview', { config: {} });
      const mockResp = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-mythos-preview',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Response');
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using unknown Anthropic model'),
      );
    });
  });

  describe.each(['claude-fable-5', 'claude-mythos-5'])('%s model', (model) => {
    const mockResponse = (modelName: string) =>
      ({
        content: [{ type: 'text', text: 'Response' }],
        model: modelName,
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as Anthropic.Messages.Message;

    it('is accepted as a known model and uses adaptive-safe request parameters', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const provider = createProvider(model, {
        config: {
          max_tokens: 4096,
          temperature: 0.5,
          top_p: 0.9,
          top_k: 40,
          thinking: { type: 'enabled', budget_tokens: 2048, display: 'summarized' },
        },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue(mockResponse(model));

      await provider.callApi('Test prompt');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params.model).toBe(model);
      expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Using unknown'));
      // The per-call thinking-incompatibility warnings ("temperature/top_k is
      // incompatible with extended thinking...") must not fire when sampling
      // params are deprecated at the model level — the deduped model-level
      // warning below covers the omission instead.
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('incompatible with extended thinking'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'temperature, top_p, and top_k are not supported on Claude Fable 5 or Claude Mythos 5',
        ),
      );
    });

    it('omits unsupported disabled thinking and treats adaptive thinking as always on', async () => {
      const provider = createProvider(model, { config: { thinking: { type: 'disabled' } } });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue(mockResponse(model));

      await provider.callApi('Test prompt');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('thinking');
      expect(params).not.toHaveProperty('temperature');
      expect(params.max_tokens).toBe(2048);
    });
  });

  describe('Claude Code OAuth authentication', () => {
    const validCredential = () => ({
      accessToken: 'sk-ant-oat-test',
      expiresAt: Date.now() + 60_000,
    });

    const mockMessageResponse = (model = 'claude-sonnet-4-6') =>
      ({
        content: [{ type: 'text', text: 'ok' }],
        model,
        id: 'id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 1, output_tokens: 2 },
      }) as Anthropic.Messages.Message;

    it('throws with guidance when no API key and no Claude Code credential are available', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(null);
      const oauthProvider = createProvider('claude-sonnet-4-6');

      await expect(oauthProvider.callApi('hello')).rejects.toThrow(
        /Anthropic API key is not set.*apiKeyRequired: false/s,
      );
    });

    it('injects the Claude Code identity block and beta headers when constructed with apiKeyRequired: false', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      expect(oauthProvider.usingClaudeCodeOAuth).toBe(true);

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('system: Grade this response\nuser: the response');

      expect(createSpy).toHaveBeenCalledTimes(1);
      const [params, requestOptions] = createSpy.mock.calls[0];
      expect(params.system).toEqual([
        { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
        { type: 'text', text: 'Grade this response' },
      ]);
      const headers = (requestOptions?.headers ?? {}) as Record<string, string>;
      expect(headers['anthropic-beta']).toContain('claude-code-20250219');
      expect(headers['anthropic-beta']).toContain('oauth-2025-04-20');
      expect(headers['user-agent']).toBe('claude-cli/1.0.0 (external, promptfoo)');
      expect(headers['x-app']).toBe('cli');
    });

    it('adds the Claude Code identity block even when no user system prompt is provided', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('hello world');

      const [params] = createSpy.mock.calls[0];
      expect(params.system).toEqual([
        { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
      ]);
    });

    it('does not inject the Claude Code identity block for API-key authenticated calls', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: TEST_API_KEY });
      const apiKeyProvider = createProvider('claude-sonnet-4-6');
      expect(apiKeyProvider.usingClaudeCodeOAuth).toBe(false);

      const createSpy = vi
        .spyOn(apiKeyProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await apiKeyProvider.callApi('system: Grade this\nuser: hi');

      const [params, requestOptions] = createSpy.mock.calls[0];
      expect(params.system).toEqual([{ type: 'text', text: 'Grade this' }]);
      const headers = (requestOptions?.headers ?? {}) as Record<string, string>;
      expect(headers['anthropic-beta'] ?? '').not.toContain('oauth-2025-04-20');
      expect(headers['user-agent']).toBeUndefined();
      expect(headers['x-app']).toBeUndefined();
    });

    it('throws at request time when the Claude Code credential is expired', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue({
        accessToken: 'sk-ant-oat-expired',
        expiresAt: Date.now() - 1000,
      });
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      await expect(oauthProvider.callApi('hello')).rejects.toThrow(
        /Claude Code OAuth credential is expired.*claude \/login/s,
      );
    });

    it('preserves user config.beta entries alongside the Claude Code beta features', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: {
          apiKeyRequired: false,
          beta: ['prompt-caching-2024-07-31'],
        },
      });

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('hello');

      const [, requestOptions] = createSpy.mock.calls[0];
      const betaHeader = (requestOptions?.headers as Record<string, string>)['anthropic-beta'];
      expect(betaHeader).toContain('prompt-caching-2024-07-31');
      expect(betaHeader).toContain('claude-code-20250219');
      expect(betaHeader).toContain('oauth-2025-04-20');
    });

    it('merges user-supplied config.headers[anthropic-beta] with OAuth beta flags', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: {
          apiKeyRequired: false,
          headers: { 'anthropic-beta': 'user-supplied-beta, another-beta' },
        },
      });

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('hello');

      const [, requestOptions] = createSpy.mock.calls[0];
      const betaHeader = (requestOptions?.headers as Record<string, string>)['anthropic-beta'];
      expect(betaHeader).toContain('user-supplied-beta');
      expect(betaHeader).toContain('another-beta');
      expect(betaHeader).toContain('claude-code-20250219');
      expect(betaHeader).toContain('oauth-2025-04-20');
    });

    it('deduplicates Claude Code beta features when the user also supplies them', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: {
          apiKeyRequired: false,
          beta: ['oauth-2025-04-20'],
        },
      });

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('hello');

      const [, requestOptions] = createSpy.mock.calls[0];
      const betaHeader = (requestOptions?.headers as Record<string, string>)['anthropic-beta'];
      const occurrences = betaHeader.split(',').filter((f) => f.trim() === 'oauth-2025-04-20');
      expect(occurrences).toHaveLength(1);
    });

    it('forces the Claude Code user-agent even when config.headers tries to override it', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: {
          apiKeyRequired: false,
          headers: { 'user-agent': 'custom/1.2.3', 'x-app': 'custom-app' },
        },
      });

      const createSpy = vi
        .spyOn(oauthProvider.anthropic.messages, 'create')
        .mockResolvedValue(mockMessageResponse());

      await oauthProvider.callApi('hello');

      const [, requestOptions] = createSpy.mock.calls[0];
      const headers = (requestOptions?.headers ?? {}) as Record<string, string>;
      expect(headers['user-agent']).toBe('claude-cli/1.0.0 (external, promptfoo)');
      expect(headers['x-app']).toBe('cli');
    });

    it('injects the Claude Code identity block and beta headers on the streaming path', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false, stream: true },
      });

      const finalMessage = mockMessageResponse();
      const streamSpy = vi.spyOn(oauthProvider.anthropic.messages, 'stream').mockReturnValue({
        finalMessage: () => Promise.resolve(finalMessage),
      } as any);

      await oauthProvider.callApi('system: Grade\nuser: hi');

      expect(streamSpy).toHaveBeenCalledTimes(1);
      const [params, requestOptions] = streamSpy.mock.calls[0];
      expect(params.system).toEqual([
        { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
        { type: 'text', text: 'Grade' },
      ]);
      const headers = (requestOptions?.headers ?? {}) as Record<string, string>;
      expect(headers['anthropic-beta']).toContain('claude-code-20250219');
      expect(headers['anthropic-beta']).toContain('oauth-2025-04-20');
      expect(headers['user-agent']).toBe('claude-cli/1.0.0 (external, promptfoo)');
      expect(headers['x-app']).toBe('cli');
    });
  });
});
