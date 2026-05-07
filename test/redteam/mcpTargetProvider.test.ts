import { describe, expect, it, vi } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp';
import { maybeWrapMcpProviderForRedteam } from '../../src/redteam/mcpTargetProvider';

import type { MCPTool } from '../../src/providers/mcp/types';
import type { CallApiContextParams, ProviderResponse } from '../../src/types';

vi.mock('../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: vi.fn().mockRejectedValue(new Error('No repair provider configured')),
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
}

describe('maybeWrapMcpProviderForRedteam', () => {
  it('materializes redteam target calls before they reach MCP providers', async () => {
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

  it('materializes multi-tool calls without requiring a repair provider', async () => {
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

    await wrapped.callApi('Search for clean energy companies.', {
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
    } as unknown as CallApiContextParams);

    expect(JSON.parse(target.calls[0].prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Search for clean energy companies.',
        limit: 10,
      },
    });
  });

  it('does not wrap non-redteam MCP calls', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);

    expect(maybeWrapMcpProviderForRedteam(target, { metadata: {} })).toBe(target);
  });

  it('does not wrap the same MCP provider more than once', () => {
    const target = new FakeMcpProvider([searchCompaniesTool]);
    const test = { metadata: { pluginId: 'bias:age' } };
    const wrapped = maybeWrapMcpProviderForRedteam(target, test);

    expect(maybeWrapMcpProviderForRedteam(wrapped, test)).toBe(wrapped);
  });
});
