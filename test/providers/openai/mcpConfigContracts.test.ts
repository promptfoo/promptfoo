import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  McpConfigInputSchema,
  OpenAiChatConfigInputSchema,
  OpenAiResponsesConfigInputSchema,
} from '../../../src/contracts';
import { MCPProvider } from '../../../src/providers/mcp';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

const client = vi.hoisted(() => ({
  construct: vi.fn(),
  initialize: vi.fn(),
  cleanup: vi.fn(),
  getAllTools: vi.fn(),
  callTool: vi.fn(),
}));
vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: class {
    connectedServers = ['fixture'];
    initialize = client.initialize;
    cleanup = client.cleanup;
    getAllTools = client.getAllTools;
    callTool = client.callTool;
    constructor(config: unknown) {
      client.construct(config);
    }
  },
}));
vi.mock('../../../src/cache', async (original) => ({
  ...(await original<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv(createUnsetOpenAiGenerationEnv());
  for (const mock of Object.values(client)) {
    mock.mockReset();
  }
  client.initialize.mockResolvedValue(undefined);
  client.cleanup.mockResolvedValue(undefined);
  client.getAllTools.mockReturnValue([
    { name: 'lookup', description: 'Fixture lookup', inputSchema: { type: 'object' } },
  ]);
  client.callTool.mockResolvedValue({ content: 'raw fixture result', raw: { value: 42 } });
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  restoreEnv();
  vi.restoreAllMocks();
});

describe('MCP contracts match their execution routes', () => {
  it('Chat sends model arguments to the local client and returns its result', async () => {
    const config = OpenAiChatConfigInputSchema.parse({
      mcp: { enabled: true, server: { command: 'fixture' } },
    });
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', {
      config: {
        apiKey: 'fixture-key',
        apiBaseUrl: 'https://fixture.example.test',
        mcp: config.mcp,
      },
    });
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'lookup', arguments: JSON.stringify({ id: 7 }) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const result = await provider.callApi('Look it up');
    expect(result.error).toBeUndefined();
    expect(client.construct).toHaveBeenCalledExactlyOnceWith(config.mcp);
    expect(client.callTool).toHaveBeenCalledExactlyOnceWith('lookup', { id: 7 }, undefined);
    expect(result.output).toBe('MCP Tool Result (lookup): raw fixture result');
    expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Fixture lookup',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  it('standalone MCP applies defaults and response callbacks with existing precedence', async () => {
    const portable = McpConfigInputSchema.parse({
      enabled: true,
      defaultArgs: { scope: 'config', configOnly: true },
    });
    const transform = vi.fn((_raw, content, context) => ({
      output: `transformed: ${content}`,
      metadata: { args: context.toolArgs },
    }));
    const legacy = vi.fn(() => {
      throw new Error('canonical transform wins');
    });
    const provider = new MCPProvider({
      config: { ...portable, transformResponse: transform, responseParser: legacy },
      defaultArgs: { scope: 'constructor', constructorOnly: true },
    });
    expect(transform).not.toHaveBeenCalled();
    const result = await provider.callApi('', {
      prompt: { raw: '', label: 'tool request' },
      vars: { prompt: JSON.stringify({ tool: 'lookup', args: { scope: 'call', id: 7 } }) },
    });
    expect(client.callTool).toHaveBeenCalledExactlyOnceWith('lookup', {
      scope: 'call',
      constructorOnly: true,
      id: 7,
    });
    expect(result.output).toBe('transformed: raw fixture result');
    expect(transform).toHaveBeenCalledOnce();
    expect(transform.mock.calls[0][2].toolArgs).toEqual({
      scope: 'call',
      constructorOnly: true,
      id: 7,
    });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('Responses forwards provider-hosted MCP definitions without creating a local client', async () => {
    const hosted = {
      type: 'mcp' as const,
      server_label: 'fixture',
      server_url: 'https://mcp.example.test',
      require_approval: 'never' as const,
    };
    const parsed = OpenAiResponsesConfigInputSchema.parse({ tools: [hosted] });
    expect(parsed.tools).toEqual([hosted]);
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'fixture-key', tools: [hosted] },
    });
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'hosted result' }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    const result = await provider.callApi('Look it up');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('hosted result');
    expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).tools).toEqual([
      hosted,
    ]);
    expect(client.construct).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
  });
});
