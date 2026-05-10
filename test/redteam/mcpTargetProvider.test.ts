import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp';
import { maybeWrapMcpProviderForRedteam } from '../../src/redteam/mcpTargetProvider';

import type { MCPTool } from '../../src/providers/mcp/types';
import type { CallApiContextParams, ProviderResponse } from '../../src/types';

const providerManagerMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}));

vi.mock('../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: providerManagerMocks.getProvider,
  },
}));

const searchCompaniesTool: MCPTool = {
  name: 'search_companies',
  description: 'Search sample company records.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', default: 10 },
    },
    required: ['query'],
  },
};

class FakeMcpProvider extends MCPProvider {
  calls: { context?: CallApiContextParams; prompt: string }[] = [];
  cleanupCalls = 0;

  constructor(private readonly tools: MCPTool[]) {
    super({ config: { enabled: false }, id: 'mcp' });
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    this.calls.push({ prompt, context });
    return { output: 'ok' };
  }

  async cleanup(): Promise<void> {
    this.cleanupCalls += 1;
  }
}

describe('maybeWrapMcpProviderForRedteam', () => {
  beforeEach(() => {
    providerManagerMocks.getProvider.mockReset();
  });

  it('materializes redteam target calls before they reach MCP providers', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output:
          '{"tool":"search_companies","args":{"query":"Find clean energy companies.","limit":10}}',
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'harmful:hate',
        purpose: 'Search companies',
      },
    });

    await wrapped.callApi('Find clean energy companies.', {
      prompt: {
        raw: '{{prompt}}',
        label: 'prompt',
      },
      vars: { prompt: 'Find clean energy companies.' },
      test: {
        metadata: {
          pluginId: 'harmful:hate',
          purpose: 'Search companies',
        },
      },
    } as unknown as CallApiContextParams);

    expect(target.calls).toHaveLength(1);
    expect(JSON.parse(target.calls[0].prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find clean energy companies.',
        limit: 10,
      },
    });
    expect(JSON.parse(String(target.calls[0].context?.vars.prompt))).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find clean energy companies.',
        limit: 10,
      },
    });
  });

  it('does not request inference when the prompt is already valid MCP JSON', async () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'harmful:hate',
        purpose: 'Search companies',
      },
    });
    const prompt = JSON.stringify({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 1 },
    });

    await wrapped.callApi(prompt, {
      prompt: {
        raw: '{{prompt}}',
        label: 'prompt',
      },
      vars: { prompt },
      test: {
        metadata: {
          pluginId: 'harmful:hate',
          purpose: 'Search companies',
        },
      },
    } as unknown as CallApiContextParams);

    expect(providerManagerMocks.getProvider).not.toHaveBeenCalled();
    expect(target.calls).toHaveLength(1);
    expect(JSON.parse(target.calls[0].prompt)).toEqual({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 1 },
    });
  });

  it('forwards directly when the MCP provider has no tools', async () => {
    const target = new FakeMcpProvider([]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        strategyId: 'jailbreak:hydra',
      },
    });

    const response = await wrapped.callApi('Plain prompt', undefined, { includeLogProbs: true });

    expect(response).toEqual({ output: 'ok' });
    expect(providerManagerMocks.getProvider).not.toHaveBeenCalled();
    expect(target.calls).toEqual([{ prompt: 'Plain prompt', context: undefined }]);
  });

  it('preserves provider identity helpers and cleanup behavior', async () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'bias:age',
      },
    });

    expect(wrapped.id()).toBe('mcp');
    expect(wrapped.toString?.()).toBe('[MCP Provider]');

    await wrapped.cleanup?.();

    expect(target.cleanupCalls).toBe(1);
  });

  it('returns a materialization error when inference provider is unavailable', async () => {
    providerManagerMocks.getProvider.mockRejectedValueOnce(
      new Error('No repair provider configured'),
    );

    const target = new FakeMcpProvider([
      {
        name: 'list_industries',
        description: 'List industries.',
        inputSchema: { type: 'object', properties: {} },
      },
      searchCompaniesTool,
    ]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'sql-injection',
        purpose: 'Search companies',
      },
    });

    await expect(
      wrapped.callApi('Search for clean energy companies.', {
        prompt: {
          raw: '{{prompt}}',
          label: 'prompt',
        },
        vars: { prompt: 'Search for clean energy companies.' },
        test: {
          metadata: {
            pluginId: 'sql-injection',
            purpose: 'Search companies',
          },
        },
      } as unknown as CallApiContextParams),
    ).resolves.toEqual({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
    });
    expect(target.calls).toHaveLength(0);
  });

  it('returns a materialization error when inference provider calls fail', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => {
        throw new Error('Repair provider failed');
      },
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'harmful:hate',
        purpose: 'Search companies',
      },
    });

    await expect(
      wrapped.callApi('Find clean energy companies.', {
        prompt: {
          raw: '{{prompt}}',
          label: 'prompt',
        },
        vars: { prompt: 'Find clean energy companies.' },
        test: {
          metadata: {
            pluginId: 'harmful:hate',
            purpose: 'Search companies',
          },
        },
      } as unknown as CallApiContextParams),
    ).resolves.toEqual({
      error: expect.stringContaining('Failed to materialize MCP target prompt'),
    });
    expect(target.calls).toHaveLength(0);
  });

  it('returns a materialization error when the wrapped provider call fails', async () => {
    providerManagerMocks.getProvider.mockResolvedValueOnce({
      id: () => 'openai:test',
      callApi: async () => ({
        output:
          '{"tool":"search_companies","args":{"query":"Find clean energy companies.","limit":10}}',
      }),
    });

    const target = new FakeMcpProvider([searchCompaniesTool]);
    vi.spyOn(target, 'callApi').mockRejectedValueOnce(new Error('Target provider failed'));
    const wrapped = maybeWrapMcpProviderForRedteam(target, {
      metadata: {
        pluginId: 'harmful:hate',
        purpose: 'Search companies',
      },
    });

    await expect(
      wrapped.callApi('Find clean energy companies.', {
        prompt: {
          raw: '{{prompt}}',
          label: 'prompt',
        },
        vars: { prompt: 'Find clean energy companies.' },
        test: {
          metadata: {
            pluginId: 'harmful:hate',
            purpose: 'Search companies',
          },
        },
      } as unknown as CallApiContextParams),
    ).resolves.toEqual({
      error: expect.stringContaining('Target provider failed'),
    });
  });

  it('does not wrap non-redteam MCP calls', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);

    expect(maybeWrapMcpProviderForRedteam(target, { metadata: {} })).toBe(target);
  });

  it('does not wrap non-MCP providers for redteam calls', () => {
    const provider = {
      id: () => 'openai:test',
      callApi: vi.fn(),
    };

    expect(
      maybeWrapMcpProviderForRedteam(provider, {
        metadata: {
          pluginId: 'bias:age',
        },
      }),
    ).toBe(provider);
  });

  it('does not wrap the same MCP provider more than once', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const test = { metadata: { pluginId: 'bias:age' } };
    const wrapped = maybeWrapMcpProviderForRedteam(target, test);

    expect(maybeWrapMcpProviderForRedteam(wrapped, test)).toBe(wrapped);
  });
});
