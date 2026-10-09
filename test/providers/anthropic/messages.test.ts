import { APIError } from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { satisfies } from 'semver';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCache,
  disableCache,
  enableCache,
  getCache,
  withCacheNamespace,
} from '../../../src/cache';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import { hashAnthropicCacheValue } from '../../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { MCPClient } from '../../../src/providers/mcp/client';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { maybeLoadResponseFormatFromExternalFile } from '../../../src/util/file';
import { createMcpServerOptions, createTypeConfig } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import type Anthropic from '@anthropic-ai/sdk';
import type { Mocked, MockedFunction } from 'vitest';

import type { AnthropicMessageOptions } from '../../../src/providers/anthropic/types';

const { createProxyAgentFactory } = await vi.hoisted(() => import('../../factories/moduleMocks'));

const createSearchToolUse = (query: string) => ({
  type: 'tool_use' as const,
  id: 'toolu_search',
  name: 'search_companies',
  input: { query },
});

const createNameSchemaOptions = () => ({
  config: {
    output_format: {
      type: 'json_schema' as const,
      schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
        additionalProperties: false as const,
      },
    },
  },
});

const createSearchTurn = (
  id: string = 'toolu_first',
  query: string = 'clean energy',
  inputTokens: number = 10,
  outputTokens: number = 5,
) => ({
  content: [
    {
      type: 'tool_use' as const,
      id,
      name: 'search_companies',
      input: { query },
    },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: inputTokens, output_tokens: outputTokens, server_tool_use: null },
});

const createAnswerOutputFormat = () => ({
  output_format: {
    type: 'json_schema' as const,
    schema: { type: 'object' as const, properties: { answer: { type: 'string' as const } } },
  },
});

const createRequiredNameOutputFormat = () => ({
  type: 'json_schema' as const,
  schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const },
    },
    required: ['name'],
    additionalProperties: false as const,
  },
});

const createStatusOutputFormat = () => ({
  type: 'json_schema' as const,
  schema: {
    type: 'object' as const,
    properties: { status: { type: 'string' as const } },
    additionalProperties: false as const,
  },
});

const createFinalAnswerText = () => ({
  type: 'text' as const,
  text: 'Final answer',
});

const createAdaptiveThinkingOptions = () => ({
  config: {
    thinking: createTypeConfig('adaptive'),
  },
});

const createBudgetedThinkingOptions = () => ({
  config: { thinking: { type: 'enabled' as const, budget_tokens: 5000 }, max_tokens: 10000 },
});

const createWeatherToolUse = () => ({
  type: 'tool_use' as const,
  id: 'toolu_weather',
  name: 'get_weather',
  input: { location: 'San Francisco' },
});

const createUserMetadataOptions = () => ({
  config: {
    metadata: { user_id: 'user-123' },
  },
});

const createOptionalApiKeyOptions = () => ({
  config: { apiKeyRequired: false },
});

const createEnabledThinkingConfig = () => ({
  type: 'enabled' as const,
  budget_tokens: 2048,
});

const createTemperatureEnvOptions = () => ({
  config: {},
  env: { ANTHROPIC_TEMPERATURE: '0.3' },
});

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

vi.mock('proxy-agent', createProxyAgentFactory());

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
  created.label ||= `test:${args[0]}`;
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
  `anthropic:messages:${modelName}:${anthropicCacheIdentityHash()}:${hashAnthropicCacheValue({ providerId: `anthropic:${modelName}`, providerLabel: `test:${modelName}` })}:${hashAnthropicCacheValue(params)}`;

const createMcpOptions = () => ({
  config: {
    mcp: createMcpServerOptions(),
  },
});

const createMockWeatherToolResponse = () => ({
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
});

describe('AnthropicMessagesProvider', () => {
  let provider: AnthropicMessagesProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessEnv({ ...originalEnv, ANTHROPIC_API_KEY: TEST_API_KEY }, { clear: true });
    mockMCPClient = undefined;
    mcpMocks.instances.length = 0;
    mcpMocks.initialize.mockReset().mockResolvedValue(undefined);
    mcpMocks.cleanup.mockReset().mockResolvedValue(undefined);
    mcpMocks.callTool.mockReset();
    mcpMocks.getAllTools.mockReset();
    mcpMocks.getAllTools.mockReturnValue([]);
    claudeCodeAuthMocks.loadClaudeCodeCredential.mockReset();
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.clearAllMocks();
    await clearCache();
    mockProcessEnv(originalEnv, { clear: true });
    mcpMocks.instances.length = 0;
  });

  it('keeps Anthropic provider identity when a custom ID has an unrelated prefix', () => {
    const provider = createProvider('claude-3-5-sonnet-20241022', { id: 'customer:reviewer' });

    expect(provider['getGenAISystem']()).toBe('anthropic');
  });

  it('keeps cache policy independent of transport-managed authentication', async () => {
    class TransportAuthenticatedProvider extends AnthropicMessagesProvider {
      protected override validateAuthentication(): void {}
    }
    const restore = mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
    try {
      enableCache();
      const provider = new TransportAuthenticatedProvider('claude-3-5-sonnet-20241022', {
        config: { stream: false },
      });
      const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Paris' }],
        usage: { input_tokens: 2, output_tokens: 1 },
      } as Anthropic.Messages.Message);
      await withCacheNamespace('transport-auth-policy', async () => {
        expect((await provider.callApi('Capital?')).output).toBe('Paris');
        expect((await provider.callApi('Capital?')).cached).toBe(true);
      });
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('still validates credentials when an adapter disables response caching', async () => {
    class UncachedProvider extends AnthropicMessagesProvider {
      protected override shouldCacheResponses(): boolean {
        return false;
      }
    }
    const restore = mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
    try {
      const provider = new UncachedProvider('claude-3-5-sonnet-20241022');
      await expect(provider.callApi('hello')).rejects.toThrow('Anthropic API key is not set');
    } finally {
      restore();
    }
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
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(
        createMockWeatherToolResponse() as Anthropic.Messages.Message,
      );

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
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(
        createMockWeatherToolResponse() as Anthropic.Messages.Message,
      );

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
      const provider = createProvider('claude-3-5-sonnet-20241022', createUserMetadataOptions());

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
      const provider = createProvider('claude-3-5-sonnet-20241022', createUserMetadataOptions());

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

    it('should isolate hashed cache keys by non-secret provider label', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        label: 'tenant-a',
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        label: 'tenant-b',
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

    it('should isolate hashed cache keys when provider labels are assigned by the loader', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-b' },
      });
      providerA.label = 'tenant-a';
      providerB.label = 'tenant-b';
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
        expect(cacheKey).not.toContain('sk-ant-tenant-a');
        expect(cacheKey).not.toContain('sk-ant-tenant-b');
      }
    });

    it('keeps unlabeled credentials isolated without persisting unreachable cache entries', async () => {
      const providerA = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const providerB = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-b' },
      });
      const persistentCache = await getCache();
      const getSpy = vi.spyOn(persistentCache, 'get');
      const setSpy = vi.spyOn(persistentCache, 'set');
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      const resultA = await providerA.callApi('Shared sensitive prompt');
      const resultB = await providerB.callApi('Shared sensitive prompt');
      const cachedResultA = await providerA.callApi('Shared sensitive prompt');
      const cachedResultB = await providerB.callApi('Shared sensitive prompt');

      expect(resultA.output).toBe('Tenant A response');
      expect(resultB.output).toBe('Tenant B response');
      expect(cachedResultA).toMatchObject({ output: 'Tenant A response', cached: true });
      expect(cachedResultB).toMatchObject({ output: 'Tenant B response', cached: true });
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('isolates unlabeled message cache entries by repeat namespace and honors clearCache', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-1' }] } as any)
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-2' }] } as any)
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-3' }] } as any);

      const repeat0 = await withCacheNamespace('repeat:0', () => provider.callApi('Same prompt'));
      const repeat1 = await withCacheNamespace('repeat:1', () => provider.callApi('Same prompt'));
      await clearCache();
      const afterClear = await withCacheNamespace('repeat:0', () =>
        provider.callApi('Same prompt'),
      );

      expect(repeat0).toMatchObject({ output: 'fresh-1' });
      expect(repeat1).toMatchObject({ output: 'fresh-2' });
      expect(afterClear).toMatchObject({ output: 'fresh-3' });
      expect(create).toHaveBeenCalledTimes(3);
    });

    it('expires unlabeled message cache entries using PROMPTFOO_CACHE_TTL', async () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_CACHE_TTL: '1' });
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-1' }] } as any)
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-2' }] } as any);

      try {
        const first = await provider.callApi('Same prompt');
        now.mockReturnValue(2_001);
        const second = await provider.callApi('Same prompt');

        expect(first).toMatchObject({ output: 'fresh-1' });
        expect(second).toMatchObject({ output: 'fresh-2' });
        expect(create).toHaveBeenCalledTimes(2);
      } finally {
        restoreEnv();
        now.mockRestore();
      }
    });

    it('invalidates unlabeled message cache entries when the cache is cleared directly', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-1' }] } as any)
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-2' }] } as any);

      await provider.callApi('Same prompt');
      await getCache().clear();
      const afterClear = await provider.callApi('Same prompt');

      expect(afterClear).toMatchObject({ output: 'fresh-2' });
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('invalidates unlabeled message cache entries when a namespaced cache is cleared', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-1' }] } as any)
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh-2' }] } as any);

      await withCacheNamespace('repeat:0', () => provider.callApi('Same prompt'));
      await withCacheNamespace('repeat:0', async () => getCache().clear());
      const afterClear = await withCacheNamespace('repeat:0', () =>
        provider.callApi('Same prompt'),
      );

      expect(afterClear).toMatchObject({ output: 'fresh-2' });
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('keeps unlabeled message cache entries when PROMPTFOO_CACHE_TTL is zero', async () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_CACHE_TTL: '0' });
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ content: [{ type: 'text', text: 'fresh-1' }] } as any);

      try {
        await provider.callApi('Same prompt');
        now.mockReturnValue(10_000_000);
        const cached = await provider.callApi('Same prompt');

        expect(cached).toMatchObject({ output: 'fresh-1', cached: true });
        expect(create).toHaveBeenCalledTimes(1);
      } finally {
        restoreEnv();
        now.mockRestore();
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

    it('should bypass the response cache for custom request auth headers', async () => {
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
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should bypass the response cache for scoped Anthropic custom headers', async () => {
      const providerA = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'shared-api-key', apiBaseUrl: 'https://gateway.example' },
        env: { ANTHROPIC_CUSTOM_HEADERS: 'X-Tenant: tenant-a-secret' },
      });
      const providerB = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'shared-api-key', apiBaseUrl: 'https://gateway.example' },
        env: { ANTHROPIC_CUSTOM_HEADERS: 'X-Tenant: tenant-b-secret' },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared prompt');
      await providerB.callApi('Shared prompt');

      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
      expect(providerA.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(providerB.anthropic.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should keep bypassing the response cache after captured ambient custom headers are cleared', async () => {
      mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Tenant: captured-secret' });
      const provider = createProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'shared-api-key', apiBaseUrl: 'https://gateway.example' },
      });
      mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: undefined });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant response' }],
      } as Anthropic.Messages.Message);

      await provider.callApi('Shared prompt');
      await provider.callApi('Shared prompt');

      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(2);
    });

    it('should bypass the response cache for duplicate-case custom auth headers', async () => {
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
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant A response' }],
      } as Anthropic.Messages.Message);
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant B response' }],
      } as Anthropic.Messages.Message);

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
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
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(
        createMockWeatherToolResponse() as Anthropic.Messages.Message,
      );

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
      expect(result).toMatchObject({
        output: 'Test output',
        cached: true,
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
          thinking: createEnabledThinkingConfig(),
        },
      });

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [
          {
            type: 'thinking',
            thinking: 'Let me analyze this step by step...',
            signature: 'test-signature',
          },
          createFinalAnswerText(),
        ],
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is 2+2?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledWith(
        {
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 3072,
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
          createFinalAnswerText(),
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
      const provider = createProvider('claude-opus-4-6', createAdaptiveThinkingOptions());

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [
          {
            type: 'thinking',
            thinking: 'Let me think adaptively...',
            signature: 'test-signature',
          },
          createFinalAnswerText(),
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
      const provider = createProvider('claude-opus-4-6', createAdaptiveThinkingOptions());

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
          thinking: createEnabledThinkingConfig(),
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

    it('prices the actual response inference geography from workspace defaults', async () => {
      const provider = createProvider('claude-opus-4-8');

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          inference_geo: 'us',
          server_tool_use: null,
        },
      } as unknown as Anthropic.Messages.Message);

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBeCloseTo(33, 10);
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

      it('should normalize model_context_window_exceeded to length', async () => {
        const provider = createProvider('claude-3-5-sonnet-20241022');
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          stop_reason: 'model_context_window_exceeded',
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
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar and Gridwise.',
      });

      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [createSearchToolUse('clean energy')],
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

    it.each([
      { label: 'between_tools', stream: false },
      { label: 'streaming between_tools', stream: true },
      { label: 'summarized adaptive thinking', adaptive: true },
      { label: 'hidden thinking', showThinking: false },
      { label: 'structured output', structured: true },
      { label: 'an older model', model: 'claude-sonnet-4-6' },
      { label: 'previously combined progress', combined: true },
    ])('preserves MCP progress for Sonnet 5.5 with $label', async (options) => {
      const model = options.model ?? 'claude-sonnet-5-5';
      provider = createProvider(model, {
        config: {
          stream: options.stream,
          showThinking: options.showThinking,
          thinking: options.adaptive
            ? { type: 'adaptive', display: 'summarized' }
            : { type: 'between_tools' },
          ...(options.structured && createAnswerOutputFormat()),
          mcp: { enabled: true, server: { command: 'npm', args: ['start'] } },
        },
      });
      const messages: Anthropic.Messages.Message[] = [0, 1, 2].map((round) => ({
        id: `msg_${round}`,
        type: 'message',
        role: 'assistant',
        model,
        container: null,
        diagnostics: null,
        stop_details: null,
        stop_reason: round < 2 ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        content: [
          { type: 'thinking', thinking: `Progress ${round}`, signature: `sig_${round}` },
          ...(round < 2
            ? ([
                {
                  type: 'tool_use',
                  id: `toolu_${round}`,
                  name: 'search_companies',
                  input: { query: `query ${round}` },
                  caller: { type: 'direct' },
                },
              ] satisfies Anthropic.Messages.ContentBlock[])
            : ([
                {
                  type: 'text',
                  text: options.structured ? '{"answer":"Acme Solar"}' : 'Acme Solar',
                  citations: null,
                },
              ] satisfies Anthropic.Messages.ContentBlock[])),
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          inference_geo: null,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: null,
        },
      }));
      if (options.combined) {
        // Aggregated responses reuse blocks; distinct blocks can still have identical text.
        messages[0].content[0] = { ...messages[1].content[0] };
        messages[2].content.unshift(messages[1].content[0]);
      }
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create');
      const streamSpy = vi.spyOn(provider.anthropic.messages, 'stream');
      for (const message of messages) {
        createSpy.mockResolvedValueOnce(message);
        streamSpy.mockReturnValueOnce({
          finalMessage: async () => message,
        } as ReturnType<typeof provider.anthropic.messages.stream>);
      }
      mcpMocks.callTool.mockResolvedValue({ content: 'Acme Solar' });

      const result = await provider.callApi('Find companies');

      const expectedProgress = (options.model ? [2] : options.combined ? [1, 1, 2] : [0, 1, 2])
        .map((round) => `Thinking: Progress ${round}\nSignature: sig_${round}`)
        .join('\n\n');
      expect(result.output).toEqual(
        options.structured
          ? { answer: 'Acme Solar' }
          : options.showThinking === false
            ? 'Acme Solar'
            : `${expectedProgress}\n\nAcme Solar`,
      );
      expect(result.tokenUsage).toMatchObject({ prompt: 30, completion: 15, total: 45 });
      expect(result.metadata?.toolCalls).toHaveLength(2);
      expect(result.error).toBeUndefined();
      const calls = options.stream ? streamSpy.mock.calls : createSpy.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[2][0].messages.slice(-4)).toMatchObject([
        { role: 'assistant', content: messages[0].content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_0' }] },
        { role: 'assistant', content: messages[1].content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] },
      ]);
    });

    it.each([
      ['cyber', 0.006],
      ['bio', 0.014],
    ] as const)(
      'prices each MCP request separately when the final request refuses %s',
      async (category, cost) => {
        provider = createProvider('claude-opus-5-5', createMcpOptions());
        mcpMocks.callTool.mockResolvedValueOnce({ content: 'Company details' });
        vi.spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValueOnce({
            content: [
              { type: 'tool_use', id: 'toolu_search', name: 'search_companies', input: {} },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 1000, output_tokens: 100 },
          } as Anthropic.Messages.Message)
          .mockResolvedValueOnce({
            content: [],
            model: 'claude-opus-5-5',
            stop_reason: 'refusal',
            stop_details: { type: 'refusal', category, explanation: null },
            usage: { input_tokens: 2000, output_tokens: 0 },
          } as unknown as Anthropic.Messages.Message);

        const result = await provider.callApi('Find companies');

        expect(result.cost).toBeCloseTo(cost, 10);
        expect(result.tokenUsage).toMatchObject({ prompt: 3000, completion: 100, total: 3100 });
        expect(result.finishReason).toBe('content_filter');
      },
    );

    it('sums thinking tokens across MCP continuation rounds', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      mcpMocks.callTool.mockResolvedValueOnce({
        content: 'Found Acme Solar and Gridwise.',
      });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [createSearchToolUse('clean energy')],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            output_tokens_details: { thinking_tokens: 3 },
            server_tool_use: null,
          },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar and Gridwise match your query.' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 7,
            output_tokens: 4,
            output_tokens_details: { thinking_tokens: 2 },
            server_tool_use: null,
          },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      // Reasoning must aggregate like output_tokens does, not report the last round only
      expect(result.tokenUsage).toMatchObject({
        prompt: 17,
        completion: 9,
        total: 26,
        completionDetails: { reasoning: 5 },
      });
    });

    it('preserves cache TTL usage across MCP continuation rounds for billing', async () => {
      provider = createProvider('claude-opus-4-8', {
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

      mcpMocks.callTool.mockResolvedValueOnce({ content: 'Found Acme Solar.' });

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
            cache_read_input_tokens: 2,
            cache_creation_input_tokens: 7,
            cache_creation: {
              ephemeral_5m_input_tokens: 3,
              ephemeral_1h_input_tokens: 4,
            },
            server_tool_use: null,
          },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar matches your query.' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 7,
            output_tokens: 4,
            cache_read_input_tokens: 1,
            cache_creation_input_tokens: 5,
            cache_creation: {
              ephemeral_5m_input_tokens: 2,
              ephemeral_1h_input_tokens: 3,
            },
            server_tool_use: null,
          },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('Find clean energy companies');

      expect(result.tokenUsage).toMatchObject({
        prompt: 32,
        completion: 9,
        total: 41,
        completionDetails: {
          cacheReadInputTokens: 3,
          cacheCreationInputTokens: 12,
        },
      });
      expect(result.cost).toBeCloseTo(0.00041275, 10);
    });

    it('does not cache MCP continuation results by default', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

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
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [createSearchToolUse('clean energy'), createWeatherToolUse()],
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
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          tool_choice: 'required' as any,
          mcp: createMcpServerOptions(),
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
    ])(
      'marks MCP tool_result blocks as errors before continuing the Anthropic conversation ($label)',
      async ({ mcpResult, expectedContent }) => {
        provider = createProvider('claude-sonnet-4-6', createMcpOptions());

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
      },
    );

    it('leaves non-MCP Anthropic tool_use blocks on the existing output path', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [createWeatherToolUse()],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the weather?');

      expect(mcpMocks.callTool).not.toHaveBeenCalled();
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result.finishReason).toBe('tool_calls');
      expect(result.output).toContain('"name":"get_weather"');
    });

    it('publishes executed MCP tool calls as metadata.toolCalls across rounds', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      mcpMocks.callTool
        .mockResolvedValueOnce({ content: 'Acme Solar, Helio Grid' })
        .mockResolvedValueOnce({ content: 'Acme Solar: 412 employees' });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'search_companies',
              input: { query: 'solar' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_2',
              name: 'search_companies',
              input: { query: 'Acme Solar headcount' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 8, output_tokens: 4, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Acme Solar has 412 employees.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 6, output_tokens: 3, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('How big is Acme Solar?');

      // Both rounds are present, in call order, so a routing assertion can check
      // which tool ran and with what arguments.
      expect(result.metadata?.toolCalls).toEqual([
        {
          id: 'toolu_1',
          name: 'search_companies',
          input: { query: 'solar' },
          output: 'Acme Solar, Helio Grid',
          is_error: false,
        },
        {
          id: 'toolu_2',
          name: 'search_companies',
          input: { query: 'Acme Solar headcount' },
          output: 'Acme Solar: 412 employees',
          is_error: false,
        },
      ]);
    });

    it('marks a failed MCP tool call as is_error in metadata.toolCalls', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      mcpMocks.callTool.mockRejectedValueOnce(new Error('upstream refused'));

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_err',
              name: 'search_companies',
              input: { query: 'solar' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, server_tool_use: null },
        } as Anthropic.Messages.Message)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'I could not reach the tool.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 6, output_tokens: 3, server_tool_use: null },
        } as Anthropic.Messages.Message);

      const result = await provider.callApi('How big is Acme Solar?');

      expect(result.metadata?.toolCalls).toMatchObject([
        { id: 'toolu_err', name: 'search_companies', is_error: true },
      ]);
      expect((result.metadata?.toolCalls as any[])[0].output).toContain('upstream refused');
    });

    it('omits metadata.toolCalls entirely when no MCP tool ran', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'No tool needed.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 4, output_tokens: 2, server_tool_use: null },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('Say hi');

      // An always-present empty array would break `metadata?.toolCalls?.length > 0`
      // filters, so the key is absent rather than empty.
      expect(result.metadata?.toolCalls).toBeUndefined();
    });

    it('keeps tool calls made before the max_tool_calls bail-out', async () => {
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          max_tool_calls: 1,
          mcp: { enabled: true, server: { command: 'npm', args: ['start'] } },
        },
      });

      mcpMocks.callTool.mockResolvedValue({ content: 'Still needs another lookup.' });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(createSearchTurn() as Anthropic.Messages.Message)
        .mockResolvedValueOnce(
          createSearchTurn('toolu_second', 'solar', 8, 4) as Anthropic.Messages.Message,
        );

      const result = await provider.callApi('Find clean energy companies');

      // The run failed on the cap, but the first round did execute — that is the
      // evidence you need to debug why the cap was hit.
      expect(result.error).toContain('exceeded max_tool_calls=1');
      expect(result.metadata?.toolCalls).toMatchObject([
        { id: 'toolu_first', name: 'search_companies', is_error: false },
      ]);
    });

    it('returns an error when MCP tool execution exceeds max_tool_calls', async () => {
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          max_tool_calls: 1,
          mcp: createMcpServerOptions(),
        },
      });

      mcpMocks.callTool.mockResolvedValue({
        content: 'Still needs another lookup.',
      });

      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(createSearchTurn() as Anthropic.Messages.Message)
        .mockResolvedValueOnce(
          createSearchTurn('toolu_second', 'solar', 8, 4) as Anthropic.Messages.Message,
        );

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
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          max_tool_calls: 0,
          mcp: createMcpServerOptions(),
        },
      });

      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValueOnce({
        content: [createSearchToolUse('clean energy')],
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
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          max_tool_calls: 1,
          mcp: createMcpServerOptions(),
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

    it('resumes a follow-up turn that pauses after an MCP tool call', async () => {
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());
      mcpMocks.callTool.mockResolvedValueOnce({ content: 'Found Acme Solar.' });
      const toolUseTurn = {
        content: [createSearchToolUse('solar')],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message;
      const pausedFollowUp = {
        content: [{ type: 'server_tool_use', id: 'srvtoolu_news', name: 'web_search', input: {} }],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 20, output_tokens: 3 },
      } as unknown as Anthropic.Messages.Message;
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(toolUseTurn)
        .mockResolvedValueOnce(pausedFollowUp)
        .mockResolvedValueOnce({
          content: [
            { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_news', content: [] },
            { type: 'text', text: 'Acme Solar is expanding.' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 30, output_tokens: 6 },
        } as unknown as Anthropic.Messages.Message);

      const result = await provider.callApi('Find solar companies in the news');

      expect(create).toHaveBeenCalledTimes(3);
      const resume = create.mock.calls[2][0] as Anthropic.Messages.MessageCreateParams;
      expect(resume.messages.slice(-3)).toEqual([
        { role: 'assistant', content: toolUseTurn.content },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_search', content: 'Found Acme Solar.' },
          ],
        },
        { role: 'assistant', content: pausedFollowUp.content },
      ]);
      expect(result.output).toContain('Acme Solar is expanding.');
      expect(result.metadata?.toolCalls).toHaveLength(1);
      expect(result.tokenUsage).toMatchObject({ prompt: 60, completion: 14, total: 74 });
    });

    it.each([
      { stream: false, structured: false },
      { stream: true, structured: false },
      { stream: false, structured: true },
      { stream: true, structured: true },
    ])(
      'retains paused files across an MCP handoff (stream: $stream, structured: $structured)',
      async ({ stream, structured }) => {
        enableCache();
        provider = createProvider('claude-sonnet-4-6', {
          config: {
            stream,
            mcp: { enabled: true, server: { command: 'npm', args: ['start'] } },
            ...(structured && createAnswerOutputFormat()),
          },
        });
        mcpMocks.callTool.mockResolvedValueOnce({ content: 'Found Acme Solar.' });
        const fileReferences = [
          { type: 'container_upload', file_id: 'file_paused' },
          { type: 'bash_code_execution_output', file_id: 'file_resumed' },
          { type: 'code_execution_output', file_id: 'file_final' },
        ] as const;
        const responses = [
          {
            content: [{ type: 'text', text: 'Preparing the report.' }, fileReferences[0]],
            stop_reason: 'pause_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          },
          {
            content: [
              {
                type: 'bash_code_execution_tool_result',
                tool_use_id: 'srvtoolu_report',
                content: {
                  type: 'bash_code_execution_result',
                  stdout: '',
                  stderr: '',
                  return_code: 0,
                  content: [fileReferences[1]],
                },
              },
              createSearchToolUse('solar'),
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 20, output_tokens: 5 },
          },
          {
            content: [
              {
                type: 'code_execution_tool_result',
                tool_use_id: 'srvtoolu_summary',
                content: {
                  type: 'code_execution_result',
                  stdout: '',
                  stderr: '',
                  return_code: 0,
                  content: [fileReferences[2]],
                },
              },
              { type: 'text', text: structured ? '{"answer":"solar"}' : 'Solar report ready.' },
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 30, output_tokens: 5 },
          },
        ] as Anthropic.Messages.Message[];
        const create = vi.spyOn(provider.anthropic.messages, 'create');
        const streamed = vi.spyOn(provider.anthropic.messages, 'stream');
        for (const response of responses) {
          if (stream) {
            streamed.mockReturnValueOnce({
              finalMessage: vi.fn().mockResolvedValue(response),
            } as unknown as ReturnType<typeof provider.anthropic.messages.stream>);
          } else {
            create.mockResolvedValueOnce(response);
          }
        }

        const result = await provider.callApi('Create a solar report');

        expect(result.output).toEqual(
          structured
            ? { answer: 'solar' }
            : `${JSON.stringify(fileReferences[2])}\n\nSolar report ready.`,
        );
        expect(result.metadata?.fileReferences).toEqual(fileReferences);
        expect(result.metadata?.toolCalls).toHaveLength(1);
        expect(result.tokenUsage).toMatchObject({ prompt: 60, completion: 15, total: 75 });
        expect(result.cost).toBeCloseTo(0.000405, 10);
        expect(result.cached).not.toBe(true);
        expect(result.error).toBeUndefined();
        expect(stream ? streamed : create).toHaveBeenCalledTimes(3);
      },
    );

    it.each([false, true])(
      'retains the latest container across paused and MCP turns with null containers (stream: %s)',
      async (stream) => {
        provider = createProvider('claude-sonnet-4-6', {
          config: {
            stream,
            mcp: { enabled: true, server: { command: 'npm', args: ['start'] } },
          },
        });
        mcpMocks.callTool.mockResolvedValue({ content: 'Found Acme Solar.' });
        const responses = [
          {
            content: [{ type: 'text', text: 'Preparing the search.' }],
            container: { id: 'container_turn', expires_at: '2026-09-30T00:00:00Z', skills: null },
            stop_reason: 'pause_turn',
          },
          {
            content: [createSearchToolUse('solar')],
            container: null,
            stop_reason: 'tool_use',
          },
          {
            content: [{ type: 'text', text: 'Checking the results.' }],
            container: {
              id: 'container_updated',
              expires_at: '2026-09-30T00:00:00Z',
              skills: null,
            },
            stop_reason: 'pause_turn',
          },
          {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_details',
                name: 'search_companies',
                input: { query: 'Acme Solar' },
              },
            ],
            container: null,
            stop_reason: 'tool_use',
          },
          {
            content: [{ type: 'text', text: 'Acme Solar is a match.' }],
            container: null,
            stop_reason: 'end_turn',
          },
        ].map((response) => ({
          ...response,
          usage: { input_tokens: 10, output_tokens: 5 },
        })) as Anthropic.Messages.Message[];
        const create = vi.spyOn(provider.anthropic.messages, 'create');
        const streamed = vi.spyOn(provider.anthropic.messages, 'stream');
        for (const response of responses) {
          if (stream) {
            streamed.mockReturnValueOnce({
              finalMessage: vi.fn().mockResolvedValue(response),
            } as unknown as ReturnType<typeof provider.anthropic.messages.stream>);
          } else {
            create.mockResolvedValueOnce(response);
          }
        }

        const result = await provider.callApi('Find solar companies');

        const calls = stream ? streamed.mock.calls : create.mock.calls;
        expect(calls.map(([params]) => params.container)).toEqual([
          undefined,
          'container_turn',
          'container_turn',
          'container_updated',
          'container_updated',
        ]);
        expect(mcpMocks.callTool).toHaveBeenCalledTimes(2);
        expect(result.output).toBe('Acme Solar is a match.');
        expect(result.error).toBeUndefined();
      },
    );

    it('continues MCP tool execution through the streaming path', async () => {
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          stream: true,
          mcp: createMcpServerOptions(),
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
      provider = createProvider('claude-sonnet-4-6', {
        config: {
          max_tool_calls: 1,
          stream: true,
          mcp: createMcpServerOptions(),
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

  describe('pause_turn continuation', () => {
    const pausedTurn: Anthropic.Messages.Message = {
      id: 'msg_paused',
      model: 'claude-sonnet-4-6',
      type: 'message',
      role: 'assistant',
      container: null,
      diagnostics: null,
      stop_details: null,
      stop_sequence: null,
      content: [
        { type: 'text', text: 'Searching for sources.', citations: null },
        {
          type: 'server_tool_use',
          id: 'srvtoolu_1',
          name: 'web_search',
          input: { query: 'solar' },
          caller: { type: 'direct' },
        },
      ],
      stop_reason: 'pause_turn',
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        inference_geo: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
      },
    };
    const finishedTurn: Anthropic.Messages.Message = {
      ...pausedTurn,
      id: 'msg_finished',
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [],
          caller: { type: 'direct' },
        },
        { type: 'text', text: 'Solar leads new capacity.', citations: null },
      ],
      stop_reason: 'end_turn',
      usage: { ...pausedTurn.usage, input_tokens: 1500, output_tokens: 200 },
    };

    it('resumes a paused turn and reports the whole turn', async () => {
      provider = createProvider('claude-sonnet-4-6', {
        config: { tools: [{ type: 'web_search_20260209', name: 'web_search' }] },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(pausedTurn)
        .mockResolvedValueOnce(finishedTurn);

      const result = await provider.callApi('What leads new power capacity?');

      expect(create).toHaveBeenCalledTimes(2);
      const [request, resume] = create.mock.calls.map(
        ([params]) => params as Anthropic.Messages.MessageCreateParams,
      );
      expect(resume).toEqual({
        ...request,
        messages: [...request.messages, { role: 'assistant', content: pausedTurn.content }],
      });
      expect(result.output).toContain('Searching for sources.');
      expect(result.output).toContain('Solar leads new capacity.');
      expect(result.finishReason).toBe('stop');
      expect(result.tokenUsage).toMatchObject({ prompt: 2500, completion: 300, total: 2800 });
      // $3/$15 per MTok: 1000 in + 100 out, then 1500 in + 200 out.
      expect(result.cost).toBeCloseTo(0.012, 10);
    });

    it.each([
      ['names the paused container', undefined, 'container_paused'],
      ['keeps the caller-pinned container', 'container_pinned', 'container_pinned'],
      [
        'keeps the caller-pinned container and skills',
        { id: 'container_pinned', skills: [{ type: 'anthropic', skill_id: 'xlsx' }] },
        { id: 'container_pinned', skills: [{ type: 'anthropic', skill_id: 'xlsx' }] },
      ],
      [
        'keeps the requested skills in the paused container',
        { skills: [{ type: 'anthropic', skill_id: 'xlsx', version: 'latest' }] },
        {
          id: 'container_paused',
          skills: [{ type: 'anthropic', skill_id: 'xlsx', version: 'latest' }],
        },
      ],
    ])('%s when resuming', async (_name, requested, expected) => {
      provider = createProvider('claude-sonnet-4-6', {
        config: { extra_body: requested ? { container: requested } : {} },
      });
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          ...pausedTurn,
          container: { id: 'container_paused', expires_at: '2026-09-30T00:00:00Z', skills: null },
        })
        .mockResolvedValueOnce(pausedTurn)
        .mockResolvedValueOnce(finishedTurn);

      await provider.callApi('Build the spreadsheet');

      expect(create).toHaveBeenCalledTimes(3);
      expect(create.mock.calls.slice(1).map(([params]) => params.container)).toEqual([
        expected,
        expected,
      ]);
    });

    it('stops resuming after five pauses and keeps the partial turn', async () => {
      provider = createProvider('claude-sonnet-4-6');
      const warnSpy = vi.spyOn(logger, 'warn');
      const create = vi.spyOn(provider.anthropic.messages, 'create');
      for (const n of [1, 2, 3, 4, 5, 6]) {
        create.mockResolvedValueOnce({
          content: [
            { type: 'server_tool_use', id: `srvtoolu_${n}`, name: 'web_search', input: {} },
          ],
          stop_reason: 'pause_turn',
          usage: { input_tokens: 10, output_tokens: 1 },
        } as unknown as Anthropic.Messages.Message);
      }

      const result = await provider.callApi('Research everything');

      expect(create).toHaveBeenCalledTimes(6);
      const lastRequest = create.mock.calls[5][0] as Anthropic.Messages.MessageCreateParams;
      expect(lastRequest.messages.at(-1)).toEqual({
        role: 'assistant',
        content: [1, 2, 3, 4, 5].map((n) => expect.objectContaining({ id: `srvtoolu_${n}` })),
      });
      expect(result.error).toBeUndefined();
      expect(result.finishReason).toBe('pause_turn');
      expect(result.tokenUsage).toMatchObject({ prompt: 60, completion: 6, total: 66 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('still paused'));
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the paused output when the resume request fails', async () => {
      provider = createProvider('claude-sonnet-4-6');
      const warnSpy = vi.spyOn(logger, 'warn');
      vi.spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(pausedTurn)
        .mockRejectedValueOnce(new Error('400 The conversation must end with a user message.'));

      const result = await provider.callApi('What leads new power capacity?');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Searching for sources.');
      expect(result.finishReason).toBe('pause_turn');
      expect(result.tokenUsage).toMatchObject({ prompt: 1000, completion: 100, total: 1100 });
      expect(result.cost).toBeCloseTo(0.0045, 10);
      expect(warnSpy).toHaveBeenCalledWith(
        'Could not resume a paused Claude turn, so the output may be incomplete: 400 The conversation must end with a user message.',
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('retries an incomplete turn instead of serving its partial output from cache', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6');
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(pausedTurn)
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce(finishedTurn);

      const partial = await provider.callApi('Research solar capacity');
      const retried = await provider.callApi('Research solar capacity');

      expect(partial.finishReason).toBe('pause_turn');
      expect(retried.cached).not.toBe(true);
      expect(retried.output).toBe('Solar leads new capacity.');
      expect(create).toHaveBeenCalledTimes(3);
    });

    it('does not start an already cancelled turn', async () => {
      provider = createProvider('claude-sonnet-4-6');
      const create = vi.spyOn(provider.anthropic.messages, 'create');
      const controller = new AbortController();
      controller.abort();

      const result = await provider.callApi('Research solar capacity', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Operation aborted');
      expect(create).not.toHaveBeenCalled();
    });

    it('ignores incomplete turns cached before automatic resumption was supported', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6');
      const prompt = 'Research solar capacity';
      const cache = await getCache();
      await cache.set(
        anthropicMessagesCacheKey('claude-sonnet-4-6', {
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          stream: false,
          temperature: 0,
        }),
        JSON.stringify(pausedTurn),
      );
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(finishedTurn);

      const result = await provider.callApi(prompt);

      expect(result.cached).not.toBe(true);
      expect(result.output).toBe('Solar leads new capacity.');
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('does not resume or cache a turn cancelled after its first response', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6');
      const controller = new AbortController();
      const create = vi.spyOn(provider.anthropic.messages, 'create');
      create.mockImplementationOnce((_params, options) => {
        expect(options?.signal).toBe(controller.signal);
        controller.abort(new Error('Evaluation cancelled'));
        return Promise.resolve(pausedTurn) as ReturnType<typeof provider.anthropic.messages.create>;
      });
      create.mockResolvedValueOnce(finishedTurn);

      const cancelled = await provider.callApi('Research solar capacity', undefined, {
        abortSignal: controller.signal,
      });
      expect(cancelled.error).toContain('Evaluation cancelled');
      expect(cancelled.output).toBeUndefined();
      expect(cancelled.tokenUsage).toMatchObject({ prompt: 1000, completion: 100, total: 1100 });
      expect(cancelled.cost).toBeCloseTo(0.0045, 10);
      expect(create).toHaveBeenCalledTimes(1);

      const retried = await provider.callApi('Research solar capacity');
      expect(retried.cached).not.toBe(true);
      expect(retried.output).toBe('Solar leads new capacity.');
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('passes cancellation to an active resume instead of returning a partial success', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6');
      const controller = new AbortController();
      const warn = vi.spyOn(logger, 'warn');
      const create = vi.spyOn(provider.anthropic.messages, 'create');
      create
        .mockResolvedValueOnce(pausedTurn)
        .mockResolvedValueOnce({
          ...pausedTurn,
          usage: {
            ...pausedTurn.usage,
            input_tokens: 400,
            output_tokens: 40,
            cache_read_input_tokens: 300,
            cache_creation_input_tokens: 200,
          },
        })
        .mockImplementationOnce((_params, options) => {
          expect(options?.signal).toBe(controller.signal);
          controller.abort(new Error('Resume cancelled'));
          return Promise.reject(controller.signal.reason) as ReturnType<
            typeof provider.anthropic.messages.create
          >;
        })
        .mockResolvedValueOnce(finishedTurn);

      const result = await provider.callApi('Research solar capacity', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toContain('Resume cancelled');
      expect(result.output).toBeUndefined();
      expect(result.tokenUsage).toMatchObject({
        prompt: 1900,
        completion: 140,
        total: 2040,
        completionDetails: { cacheReadInputTokens: 300, cacheCreationInputTokens: 200 },
      });
      expect(result.cost).toBeCloseTo(0.00714, 10);
      expect(create).toHaveBeenCalledTimes(3);
      expect(warn).not.toHaveBeenCalled();

      const retried = await provider.callApi('Research solar capacity');
      expect(retried.cached).not.toBe(true);
      expect(retried.output).toBe('Solar leads new capacity.');
      expect(create).toHaveBeenCalledTimes(4);
    });

    it('retains completed request usage when a streamed resume is cancelled', async () => {
      provider = createProvider('claude-sonnet-4-6', { config: { stream: true } });
      const controller = new AbortController();
      const stream = vi
        .spyOn(provider.anthropic.messages, 'stream')
        .mockReturnValueOnce({
          finalMessage: vi.fn().mockResolvedValue(pausedTurn),
        } as unknown as ReturnType<typeof provider.anthropic.messages.stream>)
        .mockImplementationOnce((_params, options) => {
          expect(options?.signal).toBe(controller.signal);
          return {
            finalMessage: async () => {
              controller.abort(new Error('Stream cancelled'));
              throw controller.signal.reason;
            },
          } as unknown as ReturnType<typeof provider.anthropic.messages.stream>;
        });

      const result = await provider.callApi('Research solar capacity', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toContain('Stream cancelled');
      expect(result.output).toBeUndefined();
      expect(result.tokenUsage).toMatchObject({ prompt: 1000, completion: 100, total: 1100 });
      expect(result.cost).toBeCloseTo(0.0045, 10);
      expect(stream).toHaveBeenCalledTimes(2);
    });

    it('parses only the final JSON while retaining files from the whole resumed turn', async () => {
      enableCache();
      provider = createProvider('claude-sonnet-4-6', {
        config: createAnswerOutputFormat(),
      });
      const fileReferences = [
        { type: 'container_upload', file_id: 'file_paused' },
        { type: 'code_execution_output', file_id: 'file_final' },
      ] as const;
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce({
          ...pausedTurn,
          content: [...pausedTurn.content, fileReferences[0]],
        })
        .mockResolvedValueOnce({
          ...finishedTurn,
          content: [
            {
              type: 'code_execution_tool_result',
              tool_use_id: 'srvtoolu_report',
              content: {
                type: 'code_execution_result',
                stdout: 'Execution log',
                stderr: '',
                return_code: 0,
                content: [fileReferences[1]],
              },
            },
            { type: 'text', text: '{"answer":"solar"}', citations: null },
          ],
        });

      const fresh = await provider.callApi('Create a solar report');
      const cached = await provider.callApi('Create a solar report');

      for (const result of [fresh, cached]) {
        expect(result.output).toEqual({ answer: 'solar' });
        expect(result.metadata?.fileReferences).toEqual(fileReferences);
        expect(result.cost).toBeCloseTo(0.012, 10);
      }
      expect(cached.cached).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('prices a cached resumed turn per request, like the fresh call', async () => {
      provider = createProvider('claude-opus-5-5');
      const create = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValueOnce(pausedTurn)
        .mockResolvedValueOnce({
          content: [],
          model: 'claude-opus-5-5',
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'cyber', explanation: null },
          usage: { input_tokens: 2000, output_tokens: 0 },
        } as unknown as Anthropic.Messages.Message);

      const fresh = await provider.callApi('Research the exploit');
      const cached = await provider.callApi('Research the exploit');

      expect(create).toHaveBeenCalledTimes(2);
      expect(cached.cached).toBe(true);
      // Only the paused request is billed: the API doesn't charge a cyber refusal before output.
      expect(fresh.cost).toBeCloseTo(0.006, 10);
      expect(cached.cost).toBeCloseTo(0.006, 10);
    });

    it('resumes a paused turn through the streaming path', async () => {
      provider = createProvider('claude-sonnet-4-6', { config: { stream: true } });
      const stream = vi
        .spyOn(provider.anthropic.messages, 'stream')
        .mockResolvedValueOnce({ finalMessage: vi.fn().mockResolvedValue(pausedTurn) } as any)
        .mockResolvedValueOnce({ finalMessage: vi.fn().mockResolvedValue(finishedTurn) } as any);

      const result = await provider.callApi('What leads new power capacity?');

      expect(stream).toHaveBeenCalledTimes(2);
      const resume = stream.mock.calls[1][0] as Anthropic.Messages.MessageCreateParams;
      expect(resume.messages.at(-1)).toEqual({ role: 'assistant', content: pausedTurn.content });
      expect(result.output).toContain('Solar leads new capacity.');
      expect(result.finishReason).toBe('stop');
      expect(result.tokenUsage).toMatchObject({ prompt: 2500, completion: 300, total: 2800 });
    });
  });

  describe('cleanup', () => {
    it('should handle cleanup when MCP is not enabled', async () => {
      provider = createProvider('claude-sonnet-4-6', {
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
      provider = createProvider('claude-sonnet-4-6', createMcpOptions());

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
          output_format: createRequiredNameOutputFormat(),
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
      expect(result.metadata?.fileReferences).toBeUndefined();
    });

    it('should preserve structured JSON and generated files in fresh and cached responses', async () => {
      enableCache();
      const provider = createProvider('claude-sonnet-5', {
        config: {
          showThinking: true,
          output_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
              required: ['status'],
              additionalProperties: false,
            },
          },
        },
      });
      const fileReferences = [
        { type: 'container_upload', file_id: 'file_upload' },
        { type: 'bash_code_execution_output', file_id: 'file_bash' },
        { type: 'code_execution_output', file_id: 'file_python' },
        { type: 'code_execution_output', file_id: 'file_encrypted' },
      ] as const;
      const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [
          { type: 'thinking', thinking: 'Checking generated files.', signature: 'signature' },
          { type: 'text', text: '{"status":"com', citations: null },
          fileReferences[0],
          {
            type: 'bash_code_execution_tool_result',
            tool_use_id: 'srvtoolu_bash',
            content: {
              type: 'bash_code_execution_result',
              stdout: 'Bash execution log',
              stderr: '',
              return_code: 0,
              content: [fileReferences[1]],
            },
          },
          {
            type: 'code_execution_tool_result',
            tool_use_id: 'srvtoolu_python',
            content: {
              type: 'code_execution_result',
              stdout: 'Python execution log',
              stderr: '',
              return_code: 0,
              content: [fileReferences[2]],
            },
          },
          {
            type: 'code_execution_tool_result',
            tool_use_id: 'srvtoolu_encrypted',
            content: {
              type: 'encrypted_code_execution_result',
              encrypted_stdout: 'Encrypted execution log',
              stderr: '',
              return_code: 0,
              content: [fileReferences[3]],
            },
          },
          { type: 'text', text: 'plete"}', citations: null },
        ] satisfies Anthropic.Messages.ContentBlock[],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 8 },
      } as Anthropic.Messages.Message);

      const fresh = await provider.callApi('Create reports and return their status');
      const cached = await provider.callApi('Create reports and return their status');

      for (const response of [fresh, cached]) {
        expect(response.output).toEqual({ status: 'complete' });
        expect(response.metadata).toEqual({ fileReferences });
      }
      expect(fresh.cached).not.toBe(true);
      expect(cached.cached).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        stopReason: 'tool_use',
        block: {
          type: 'tool_use',
          id: 'toolu_report',
          name: 'create_report',
          input: {},
        },
      },
      {
        stopReason: 'pause_turn',
        block: {
          type: 'server_tool_use',
          id: 'srvtoolu_report',
          name: 'code_execution',
          input: {},
        },
      },
    ] as const)(
      'should preserve pending $stopReason tool blocks with structured JSON text',
      async ({ stopReason, block }) => {
        const provider = createProvider('claude-sonnet-5', {
          config: {
            output_format: createStatusOutputFormat(),
          },
        });
        const text = '{"status":"pending"}';
        vi.spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValueOnce({
            content: [{ type: 'text', text, citations: null }, block],
            stop_reason: stopReason,
            usage: { input_tokens: 10, output_tokens: 8 },
          } as Anthropic.Messages.Message)
          .mockRejectedValueOnce(new Error('Resume failed'));

        const result = await provider.callApi('Create a report');

        expect(result.output).toBe(`${text}\n\n${JSON.stringify(block)}`);
      },
    );

    it('should handle JSON parsing errors gracefully', async () => {
      const provider = createProvider('claude-sonnet-4-5-20250929', createNameSchemaOptions());

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
      const provider = createProvider('claude-sonnet-4-5-20250929', createNameSchemaOptions());

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
          output_format: createStatusOutputFormat(),
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
        diagnostics: null,
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
          output_format: createRequiredNameOutputFormat(),
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

    it.each(['', 'invalid'])(
      'does not revive ambient sampling after a provider temperature mask of %j',
      async (temperature) => {
        await cliState.withEnv({ ANTHROPIC_TEMPERATURE: '0.9' }, async () => {
          const provider = createProvider('claude-sonnet-4-6', {
            config: {},
            env: { ANTHROPIC_TEMPERATURE: temperature },
          });
          const create = vi
            .spyOn(provider.anthropic.messages, 'create')
            .mockResolvedValue(mockResponse);
          await provider.callApi('Masked sampling');
          expect(create.mock.calls[0][0]).toHaveProperty('temperature', 0);
        });
      },
    );

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

  describe('Claude generation detection with Anthropic-compatible gateways', () => {
    const mockResp = {
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-prod-5',
      id: 'test-id',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Anthropic.Messages.Message;

    const proxyConfigs = [
      {
        source: 'apiBaseUrl',
        apiBaseUrl: 'https://gateway.example.com/v1',
        env: undefined,
      },
      {
        source: 'ANTHROPIC_BASE_URL',
        apiBaseUrl: undefined,
        env: { ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1' },
      },
    ];

    it.each(proxyConfigs)(
      'preserves sampling parameters for a numbered alias behind $source',
      async ({ apiBaseUrl, env }) => {
        const provider = createProvider('claude-prod-5', {
          config: {
            ...(apiBaseUrl ? { apiBaseUrl } : {}),
            temperature: 0.5,
            top_k: 40,
          },
          env,
        });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue(mockResp);

        await provider.callApi('Hello');

        expect(createSpy.mock.calls[0][0]).toMatchObject({
          model: 'claude-prod-5',
          temperature: 0.5,
          top_k: 40,
        });
      },
    );

    it.each(proxyConfigs)(
      'preserves top_p for a numbered alias behind $source',
      async ({ apiBaseUrl, env }) => {
        const provider = createProvider('claude-prod-5', {
          config: { ...(apiBaseUrl ? { apiBaseUrl } : {}), top_p: 0.9 },
          env,
        });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue(mockResp);

        await provider.callApi('Hello');

        expect(createSpy.mock.calls[0][0]).toMatchObject({
          model: 'claude-prod-5',
          top_p: 0.9,
        });
      },
    );

    it.each(proxyConfigs)(
      'preserves manual thinking for a numbered alias behind $source',
      async ({ apiBaseUrl, env }) => {
        const provider = createProvider('claude-prod-5', {
          config: {
            ...(apiBaseUrl ? { apiBaseUrl } : {}),
            thinking: { type: 'enabled', budget_tokens: 5000 },
            max_tokens: 10000,
          },
          env,
        });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue(mockResp);

        await provider.callApi('Hello');

        expect(createSpy.mock.calls[0][0]).toMatchObject({
          model: 'claude-prod-5',
          thinking: { type: 'enabled', budget_tokens: 5000 },
        });
      },
    );

    it('detects future Claude generations at an explicitly configured Anthropic API URL', async () => {
      const provider = createProvider('claude-haiku-5', {
        config: { apiBaseUrl: 'https://api.anthropic.com/v1', temperature: 0.5 },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-haiku-5' });

      await provider.callApi('Hello');

      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('temperature');
    });

    it('retains explicit Claude family capabilities behind a compatible gateway', async () => {
      const provider = createProvider('claude-opus-5', {
        config: { apiBaseUrl: 'https://gateway.example.com/v1', temperature: 0.5 },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('temperature');
    });
  });

  describe('thinking budget vs max_tokens', () => {
    const mockResp = {
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-sonnet-4-5',
      id: 'test-id',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Anthropic.Messages.Message;

    it('raises the default max_tokens above a manual thinking budget', async () => {
      // Anthropic 400s on max_tokens <= budget_tokens. The default here is 2048 once
      // thinking consumes tokens, so an 8000-token budget used to fail the request.
      const provider = createProvider('claude-sonnet-4-5', {
        config: { thinking: { type: 'enabled', budget_tokens: 8000 } },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as any;
      expect(params.max_tokens).toBe(9024);
      expect(params.max_tokens).toBeGreaterThan(params.thinking.budget_tokens);
    });

    it('raises max_tokens when it exactly matches the manual thinking budget', async () => {
      const provider = createProvider('claude-sonnet-4-5', {
        config: { max_tokens: 8000, thinking: { type: 'enabled', budget_tokens: 8000 } },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      await provider.callApi('Hello');

      expect(createSpy.mock.calls[0][0].max_tokens).toBe(9024);
    });

    it('leaves an explicit max_tokens that already clears the budget', async () => {
      const provider = createProvider('claude-sonnet-4-5', {
        config: { max_tokens: 20000, thinking: { type: 'enabled', budget_tokens: 8000 } },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      await provider.callApi('Hello');

      expect((createSpy.mock.calls[0][0] as any).max_tokens).toBe(20000);
    });

    it('does not inflate max_tokens when the budget was converted to adaptive', async () => {
      // Opus 5 is sampling-deprecated: the manual budget is normalized away, so there is
      // nothing to clamp against and the default must stand.
      const provider = createProvider('claude-opus-5', {
        config: { thinking: { type: 'enabled', budget_tokens: 8000 } },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as any;
      expect(params.thinking).toEqual({ type: 'adaptive' });
      expect(params.max_tokens).toBe(2048);
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

    it.each(['suite', 'file'] as const)(
      'warns for deprecated sampling supplied by the %s layer',
      async (layer) => {
        const provider = createProvider('claude-sonnet-5', { config: {} });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue(mockResp);
        const warnSpy = vi.spyOn(logger, 'warn');
        const run =
          layer === 'suite'
            ? cliState.withEnv.bind(cliState)
            : cliState.withEnvFileOverrides.bind(cliState);
        await run({ ANTHROPIC_TEMPERATURE: '0.3' }, () => provider.callApi('Scoped sampling test'));
        expect(createSpy.mock.calls[0][0]).not.toHaveProperty('temperature');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('temperature is deprecated on Claude Sonnet 5'),
        );
      },
    );

    it.each(['', 'invalid'])(
      'does not warn for masked deprecated sampling: %j',
      async (temperature) => {
        await cliState.withEnv({ ANTHROPIC_TEMPERATURE: '0.9' }, async () => {
          const provider = createProvider('claude-sonnet-5', {
            config: {},
            env: { ANTHROPIC_TEMPERATURE: temperature },
          });
          const create = vi
            .spyOn(provider.anthropic.messages, 'create')
            .mockResolvedValue(mockResp);
          const warn = vi.spyOn(logger, 'warn');
          await provider.callApi('Masked sampling');
          expect(create.mock.calls[0][0]).not.toHaveProperty('temperature');
          expect(warn).not.toHaveBeenCalledWith(
            expect.stringContaining('temperature is deprecated'),
          );
        });
      },
    );

    it('warns on Opus 4.7 when temperature set via env override', async () => {
      const provider = createProvider('claude-opus-4-7', createTemperatureEnvOptions());
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
      const provider = createProvider('claude-opus-4-8', createTemperatureEnvOptions());
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
      const provider = createProvider('claude-opus-4-8', createBudgetedThinkingOptions());
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
      const provider = createProvider('claude-opus-4-6', createBudgetedThinkingOptions());
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

    it('omits the built-in temperature default for Sonnet 5 (no explicit config)', async () => {
      // Regression for the live-API 400: `temperature` is deprecated for this model.
      const provider = createProvider('claude-sonnet-5', { config: {} });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-sonnet-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
    });

    it('omits temperature/top_p/top_k and warns with a Sonnet 5 message', async () => {
      const provider = createProvider('claude-sonnet-5', {
        config: { temperature: 0.5, top_p: 0.9, top_k: 40 },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-sonnet-5' });
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Sonnet 5'),
      );
    });

    it('still sends temperature on Sonnet 4.6 (regression — 4.x keeps sampling params)', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: { temperature: 0.5 } });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-sonnet-4-6' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).toHaveProperty('temperature', 0.5);
    });

    it('converts manual thinking to adaptive on Sonnet 5 (migrated config)', async () => {
      const provider = createProvider('claude-sonnet-5', createBudgetedThinkingOptions());
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-sonnet-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: { type?: string; budget_tokens?: number };
      };
      expect(params.thinking?.type).toBe('adaptive');
      expect(params.thinking?.budget_tokens).toBeUndefined();
    });

    it.each([
      { model: 'claude-sonnet-5', expected: 2048 },
      { model: 'claude-opus-5', expected: 2048 },
      { model: 'claude-opus-4-8', expected: 1024 },
      { model: 'claude-opus-4-7', expected: 1024 },
    ])(
      'sizes the default max_tokens for $model by whether it thinks by default',
      async ({ model, expected }) => {
        // Sonnet 5 and Opus 5 return thinking blocks for a request that never sets
        // `thinking`, and those tokens come out of max_tokens — so the default needs
        // headroom or answers truncate mid-sentence. Opus 4.7/4.8 do not think unless
        // asked, and keep the smaller default.
        const provider = createProvider(model, { config: {} });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue({ ...mockResp, model });

        await provider.callApi('Hello');

        expect((createSpy.mock.calls[0][0] as unknown as Record<string, unknown>).max_tokens).toBe(
          expected,
        );
      },
    );

    it('omits the built-in temperature default for Opus 5 (no explicit config)', async () => {
      // Opus 5 inherits the Opus 4.7+ sampling-param deprecation: temperature would 400.
      const provider = createProvider('claude-opus-5', { config: {} });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
    });

    it('warns with an Opus 5 message when sampling params are set', async () => {
      const provider = createProvider('claude-opus-5', { config: { temperature: 0.5 } });
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        ...mockResp,
        model: 'claude-opus-5',
      });
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('temperature is deprecated on Claude Opus 5'),
      );
    });

    it('converts manual thinking to adaptive on Opus 5 (migrated config)', async () => {
      const provider = createProvider('claude-opus-5', createBudgetedThinkingOptions());
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: { type?: string; budget_tokens?: number };
      };
      expect(params.thinking?.type).toBe('adaptive');
      expect(params.thinking?.budget_tokens).toBeUndefined();
    });

    it('keeps thinking disabled on Opus 5 at effort "high" or below', async () => {
      const provider = createProvider('claude-opus-5', {
        config: { thinking: { type: 'disabled' }, effort: 'high' },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: { type?: string };
        output_config?: { effort?: string };
      };
      expect(params.thinking?.type).toBe('disabled');
      expect(params.output_config?.effort).toBe('high');
    });

    it('drops thinking:disabled on Opus 5 at effort "xhigh" (the API rejects the pairing)', async () => {
      const provider = createProvider('claude-opus-5', {
        config: { thinking: { type: 'disabled' }, effort: 'xhigh' },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        thinking?: unknown;
        output_config?: { effort?: string };
      };
      expect(params.thinking).toBeUndefined();
      // Effort is preserved — only the rejected `disabled` thinking is dropped.
      expect(params.output_config?.effort).toBe('xhigh');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude Opus 5 only accepts thinking.type "disabled" at effort'),
      );
    });

    it('sizes the default max_tokens for thinking on Opus 5 when thinking is unset', async () => {
      // Opus 5 thinks by default, so max_tokens must leave thinking headroom or the
      // response truncates mid-answer.
      const provider = createProvider('claude-opus-5', { config: {} });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as { max_tokens?: number };
      expect(params.max_tokens).toBe(2048);
    });

    it('keeps a forced tool_choice on Opus 5 even though it thinks by default', async () => {
      // Regression: thinks-by-default must NOT count as "thinking enabled" for the forced
      // tool_choice suppression. Verified against the live API that adaptive thinking and a
      // forced tool_choice are compatible on Opus 5, so dropping tool_choice here would
      // silently change what the user asked for.
      const provider = createProvider('claude-opus-5', {
        config: {
          tool_choice: { type: 'any' },
          tools: [
            { name: 'get_weather', description: 'w', input_schema: { type: 'object' } } as any,
          ],
        },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-5' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as {
        tool_choice?: { type?: string };
        max_tokens?: number;
      };
      expect(params.tool_choice).toEqual({ type: 'any' });
      // ...while still getting the thinking headroom on max_tokens.
      expect(params.max_tokens).toBe(2048);
    });

    it.each([
      { model: 'claude-opus-5', thinking: { type: 'adaptive' as const } },
      { model: 'claude-opus-4-8', thinking: { type: 'adaptive' as const } },
      { model: 'claude-opus-4-6', thinking: { type: 'adaptive' as const } },
      { model: 'claude-sonnet-4-6', thinking: { type: 'adaptive' as const } },
      // Fable is always-on adaptive; normalization strips any explicit config.
      { model: 'claude-fable-5', thinking: undefined },
    ])(
      'keeps a forced tool_choice with adaptive thinking on $model',
      async ({ model, thinking }) => {
        // Verified live that adaptive thinking + a forced tool_choice returns 200 on all of
        // these; only legacy budget-based thinking is rejected by the API.
        const provider = createProvider(model, {
          config: {
            ...(thinking ? { thinking } : {}),
            tool_choice: { type: 'any' },
            tools: [
              { name: 'get_weather', description: 'w', input_schema: { type: 'object' } } as any,
            ],
          },
        });
        const createSpy = vi
          .spyOn(provider.anthropic.messages, 'create')
          .mockResolvedValue({ ...mockResp, model });

        await provider.callApi('Hello');

        const params = createSpy.mock.calls[0][0] as unknown as { tool_choice?: unknown };
        expect(params.tool_choice).toEqual({ type: 'any' });
      },
    );

    it('drops a forced tool_choice only for legacy budget-based thinking', async () => {
      // The API rejects this pairing: "Thinking may not be enabled when tool_choice forces
      // tool use." Opus 4.6 still accepts budget-based thinking, so it is the case to cover.
      const provider = createProvider('claude-opus-4-6', {
        config: {
          thinking: { type: 'enabled', budget_tokens: 2048 },
          max_tokens: 8192,
          tool_choice: { type: 'any' },
          tools: [
            { name: 'get_weather', description: 'w', input_schema: { type: 'object' } } as any,
          ],
        },
      });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-4-6' });
      const warnSpy = vi.spyOn(logger, 'warn');

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as { tool_choice?: unknown };
      expect(params.tool_choice).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('forced tool use) is incompatible with extended thinking'),
      );
    });

    it('uses the non-thinking default max_tokens on Opus 4.8 when thinking is unset', async () => {
      // Regression guard: 4.8 does NOT think by default, so the smaller default still applies.
      const provider = createProvider('claude-opus-4-8', { config: {} });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue({ ...mockResp, model: 'claude-opus-4-8' });

      await provider.callApi('Hello');

      const params = createSpy.mock.calls[0][0] as unknown as { max_tokens?: number };
      expect(params.max_tokens).toBe(1024);
    });
  });

  describe('refusal stop_details handling', () => {
    it.each([
      ['bio', 0, 0.004],
      ['frontier_llm', 0, 0.004],
      ['reasoning_extraction', 0, 0.004],
      ['cyber', 0, 0],
      ['general_harms', 0, 0],
      [null, 0, 0],
      ['cyber', 100, 0.006],
      ['bio', 100, 0.006],
    ] as const)(
      'prices %s refusals with %i output tokens at $%s',
      async (category, outputTokens, cost) => {
        const provider = createProvider('claude-opus-5-5', { config: {} });
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          content: [],
          model: 'claude-opus-5-5',
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category, explanation: null },
          usage: { input_tokens: 1000, output_tokens: outputTokens },
        } as unknown as Anthropic.Messages.Message);

        const result = await provider.callApi('Refused request');

        expect(result.cost).toBeCloseTo(cost, 10);
        expect(result.finishReason).toBe('content_filter');
        expect(result.tokenUsage?.prompt).toBe(1000);
      },
    );

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

    it('should expose general_harms refusals as flagged guardrails', async () => {
      const provider = createProvider('claude-sonnet-4-6', { config: {} });
      const refusalResponse = {
        content: [{ type: 'text', text: '' }],
        model: 'claude-sonnet-4-6',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'refusal',
        stop_details: {
          type: 'refusal',
          category: 'general_harms',
          explanation: 'The request may involve a harmful area',
        },
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 0 },
      } as unknown as Anthropic.Messages.Message;
      vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(refusalResponse);

      const result = await provider.callApi('A request refused for general harms');

      expect(result.guardrails).toEqual({
        flagged: true,
        reason: expect.stringContaining('category: general_harms'),
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
      expect(result.cost).toBe(0);
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

      expect(result.cost).toBeCloseTo(0.00003, 10);
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
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(mockResp);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Response');
      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('temperature');
      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('top_p');
      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('top_k');
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using unknown Anthropic model'),
      );
    });

    it.each([
      { name: 'default', sampling: {} },
      { name: 'explicit', sampling: { temperature: 0.5, top_p: 0.7, top_k: 40 } },
    ])('omits $name sampling parameters with adaptive thinking', async ({ sampling }) => {
      const provider = createProvider('claude-mythos-preview', {
        config: { thinking: { type: 'adaptive' }, ...sampling },
      });
      const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-mythos-preview',
        id: 'msg-mythos-preview-sampling',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as Anthropic.Messages.Message);

      await provider.callApi('Test prompt');

      const params = createSpy.mock.calls[0][0];
      expect(params.thinking).toEqual({ type: 'adaptive' });
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
    });
  });

  describe.each([
    'claude-fable-5',
    'claude-mythos-5',
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-opus-5-5',
  ])('%s model', (model) => {
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
          `temperature, top_p, and top_k are not supported on Claude ${
            model === 'claude-opus-5-5' ? 'Opus 5.5' : 'Fable'
          }`,
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

  describe.each(['claude-fable-5-1', 'claude-mythos-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5'])(
    '%s tool choice',
    (model) => {
      it.each([
        { type: 'any' as const },
        { type: 'tool' as const, name: 'get_weather' },
        { type: 'auto' as const },
        { type: 'none' as const },
      ])('omits only unsupported forced tool choice: %j', async (tool_choice) => {
        const warnSpy = vi.spyOn(logger, 'warn');
        const provider = createProvider(model, {
          config: {
            tools: [{ name: 'get_weather', input_schema: { type: 'object', properties: {} } }],
            tool_choice,
            thinking: { type: 'adaptive' },
          },
        });
        const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          id: 'msg-51',
          type: 'message',
          role: 'assistant',
          model,
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        } as Anthropic.Messages.Message);

        await provider.callApi('Check the weather');

        const params = createSpy.mock.calls[0][0];
        expect(params.tools).toHaveLength(1);
        if (tool_choice.type === 'any' || tool_choice.type === 'tool') {
          expect(params).not.toHaveProperty('tool_choice');
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('(forced tool use) is not supported on Claude'),
          );
        } else {
          expect(params.tool_choice).toEqual(tool_choice);
        }
      });
    },
  );

  describe('claude-sonnet-5-5 thinking', () => {
    const mockResponse = () =>
      ({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-5-5',
        id: 'test-id',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_details: null,
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as Anthropic.Messages.Message;

    const callWith = async (config: AnthropicMessageOptions) => {
      const provider = createProvider('claude-sonnet-5-5', { config });
      const createSpy = vi
        .spyOn(provider.anthropic.messages, 'create')
        .mockResolvedValue(mockResponse());
      await provider.callApi('Test prompt');
      return createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
    };

    it('sends disabled thinking as between_tools, the lowest setting the API accepts', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const params = await callWith({ thinking: { type: 'disabled' } });

      expect(params.thinking).toEqual({ type: 'between_tools' });
      // No up-front thinking, so no thinking headroom in the default max_tokens.
      expect(params.max_tokens).toBe(1024);
      expect(warnSpy).toHaveBeenCalledWith(
        'Claude Sonnet 5.5 does not accept thinking.type "disabled", so it has been sent as "between_tools", the model\'s lowest setting, which turns off up-front thinking. Set thinking.type "between_tools" to silence this warning.',
      );
    });

    it('omits disabled thinking above high effort, where between_tools is also rejected', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const params = await callWith({ thinking: { type: 'disabled' }, effort: 'max' });

      expect(params).not.toHaveProperty('thinking');
      expect(params.output_config).toEqual({ effort: 'max' });
      expect(params.max_tokens).toBe(2048);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Claude Sonnet 5.5 only accepts thinking.type "between_tools" at effort "high" or below (got "max")',
        ),
      );
    });

    it('omits explicit between_tools above high effort, where the API rejects it', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const params = await callWith({ thinking: { type: 'between_tools' }, effort: 'max' });

      expect(params).not.toHaveProperty('thinking');
      expect(params.output_config).toEqual({ effort: 'max' });
      expect(params.max_tokens).toBe(2048);
      expect(warnSpy).toHaveBeenCalledWith(
        'Claude Sonnet 5.5 only accepts thinking.type "between_tools" at effort "high" or below (got "max"), so it has been omitted and the model thinks adaptively. Lower effort to "high" to turn off up-front thinking.',
      );
    });

    it('passes explicit between_tools through without a warning', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const params = await callWith({ thinking: { type: 'between_tools' }, effort: 'high' });

      expect(params.thinking).toEqual({ type: 'between_tools' });
      expect(params.max_tokens).toBe(1024);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('leaves thinking to the API default and reserves headroom for it', async () => {
      const params = await callWith({});

      expect(params).not.toHaveProperty('thinking');
      expect(params).not.toHaveProperty('temperature');
      expect(params.max_tokens).toBe(2048);
    });

    it('converts manual budgets to adaptive thinking and drops sampling params', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const params = await callWith({
        thinking: { type: 'enabled', budget_tokens: 2048 },
        temperature: 0.5,
        top_p: 0.9,
        top_k: 40,
      });

      expect(params.thinking).toEqual({ type: 'adaptive' });
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not supported on Claude Sonnet 5.5 and has been converted'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'temperature is deprecated on Claude Sonnet 5.5 and will be omitted',
        ),
      );
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
      const oauthProvider = createProvider('claude-sonnet-4-6', createOptionalApiKeyOptions());

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
      expect(headers['user-agent']).toBe('claude-cli/2.1.285 (external, promptfoo)');
      expect(headers['x-app']).toBe('cli');
    });

    it.each([false, true])(
      'sends a supported OAuth client version to newer models (stream: %s)',
      async (stream) => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
        const model = 'claude-opus-5-5';
        const oauthProvider = createProvider(model, {
          config: { apiKeyRequired: false, stream },
        });
        const message = mockMessageResponse(model);
        const createSpy = vi
          .spyOn(oauthProvider.anthropic.messages, 'create')
          .mockResolvedValue(message);
        const streamSpy = vi.spyOn(oauthProvider.anthropic.messages, 'stream').mockReturnValue({
          finalMessage: async () => message,
        } as ReturnType<typeof oauthProvider.anthropic.messages.stream>);

        const response = await oauthProvider.callApi('hello');

        expect(response.error).toBeUndefined();
        expect(response.output).toBe('ok');
        const requestSpy = stream ? streamSpy : createSpy;
        expect(requestSpy).toHaveBeenCalledTimes(1);
        const [params, requestOptions] = requestSpy.mock.calls[0];
        expect(params.model).toBe(model);
        const headers = (requestOptions?.headers ?? {}) as Record<string, string>;
        const match = /^claude-cli\/(\d+\.\d+\.\d+) \(external, promptfoo\)$/.exec(
          headers['user-agent'],
        );
        expect(match).not.toBeNull();
        // The API rejects this model below 2.1.280; compare semver components
        // correctly across minor/major releases. See issue #11322.
        expect(satisfies(match?.[1] ?? '', '>=2.1.280')).toBe(true);
      },
    );

    it('isolates response-cache namespaces for distinct Claude Code OAuth tenants', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential
        .mockReturnValueOnce({ accessToken: 'sk-ant-oat-tenant-a', expiresAt: Date.now() + 60_000 })
        .mockReturnValueOnce({
          accessToken: 'sk-ant-oat-tenant-b',
          expiresAt: Date.now() + 60_000,
        });
      const providerA = createProvider('claude-sonnet-4-6', {
        label: 'tenant-a',
        config: { apiKeyRequired: false },
      });
      const providerB = createProvider('claude-sonnet-4-6', {
        label: 'tenant-b',
        config: { apiKeyRequired: false },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get').mockResolvedValue(undefined);
      vi.spyOn(cache, 'set').mockResolvedValue(undefined);
      vi.spyOn(providerA.anthropic.messages, 'create').mockResolvedValue(mockMessageResponse());
      vi.spyOn(providerB.anthropic.messages, 'create').mockResolvedValue(mockMessageResponse());

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).not.toBe(cacheKeyB);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('sk-ant-oat-tenant-a');
        expect(cacheKey).not.toContain('sk-ant-oat-tenant-b');
        expect(cacheKey).not.toContain('Shared sensitive prompt');
      }
    });

    it('adds the Claude Code identity block even when no user system prompt is provided', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(validCredential());
      const oauthProvider = createProvider('claude-sonnet-4-6', createOptionalApiKeyOptions());

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
      const oauthProvider = createProvider('claude-sonnet-4-6', createOptionalApiKeyOptions());

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
      expect(headers['user-agent']).toBe('claude-cli/2.1.285 (external, promptfoo)');
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
      expect(headers['user-agent']).toBe('claude-cli/2.1.285 (external, promptfoo)');
      expect(headers['x-app']).toBe('cli');
    });
  });
});
