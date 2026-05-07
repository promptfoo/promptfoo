import { beforeEach, describe, expect, it, vi } from 'vitest';
import { materializeMcpValue } from '../../src/redteam/mcpMaterialization';

import type { MCPTool } from '../../src/providers/mcp/types';
import type { ApiProvider } from '../../src/types/index';

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

describe('materializeMcpValue', () => {
  const provider = {
    id: () => 'openai:test',
    callApi: vi.fn(),
  } as unknown as ApiProvider;

  beforeEach(() => {
    vi.mocked(provider.callApi).mockReset();
  });

  it('leaves valid MCP tool-call prompts unchanged', async () => {
    const value = JSON.stringify({ tool: 'search_companies', args: { query: 'cloud', limit: 1 } });
    const result = await materializeMcpValue({
      purpose: 'Search companies',
      value,
      tools: [searchCompaniesTool],
    });

    expect(result).toEqual({
      originalValue: value,
      prompt: value,
    });
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('repairs existing MCP tool-call prompts that fail tool schema validation', async () => {
    const result = await materializeMcpValue({
      intentValue: 'Find cloud companies.',
      purpose: 'Search companies',
      value: JSON.stringify({ tool: 'search_companies', args: { limit: 1 } }),
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find cloud companies.',
        limit: 1,
      },
    });
  });

  it('materializes plain text intents into a single selected MCP tool call', async () => {
    const value = 'Search for companies owned by immigrants and show complaints.';
    const result = await materializeMcpValue({
      purpose: 'Search companies',
      value,
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Search for companies owned by immigrants and show complaints.',
        limit: 10,
      },
    });
    expect(result.originalValue).toBe(value);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('uses the redteam provider to repair plain text intents when tool choice is ambiguous', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"search_companies","args":{"query":"clean energy","limit":3}}',
    });

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find clean energy companies.',
      tools: [
        searchCompaniesTool,
        {
          name: 'list_industries',
          description: 'List industries.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: { query: 'clean energy', limit: 3 },
    });
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Find clean energy companies.'),
    );
  });

  it('falls back to deterministic tool selection when no repair provider is available', async () => {
    const result = await materializeMcpValue({
      purpose: 'Search companies',
      value: 'Search for clean energy companies.',
      tools: [
        {
          name: 'list_industries',
          description: 'List industries.',
          inputSchema: { type: 'object', properties: {} },
        },
        searchCompaniesTool,
      ],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Search for clean energy companies.',
        limit: 10,
      },
    });
  });

  it('falls back to deterministic materialization when provider repair picks an unknown tool', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"unknown_tool","args":{}}',
    });

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find clean energy companies.',
      tools: [
        searchCompaniesTool,
        {
          name: 'list_industries',
          description: 'List industries.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find clean energy companies.',
        limit: 10,
      },
    });
  });

  it('falls back to deterministic materialization when provider repair throws', async () => {
    vi.mocked(provider.callApi).mockRejectedValueOnce(new Error('Missing API key'));

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find clean energy companies.',
      tools: [
        {
          name: 'list_industries',
          description: 'List industries.',
          inputSchema: { type: 'object', properties: {} },
        },
        searchCompaniesTool,
      ],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find clean energy companies.',
        limit: 10,
      },
    });
  });

  it('falls back to deterministic materialization when provider repair chooses schema-invalid args', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"search_companies","args":{"limit":3}}',
    });

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find clean energy companies.',
      tools: [
        searchCompaniesTool,
        {
          name: 'list_industries',
          description: 'List industries.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(JSON.parse(result.prompt)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find clean energy companies.',
        limit: 10,
      },
    });
  });

  it('throws when neither provider nor deterministic materialization can satisfy the schema', async () => {
    await expect(
      materializeMcpValue({
        purpose: 'Search companies',
        value: 'Find clean energy companies.',
        tools: [
          {
            name: 'rank_companies',
            description: 'Rank companies.',
            inputSchema: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
              },
              required: ['count'],
            },
          },
        ],
      }),
    ).rejects.toThrow('Failed to materialize MCP value');
  });
});
