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

const listIndustriesTool: MCPTool = {
  name: 'list_industries',
  description: 'List industries.',
  inputSchema: { type: 'object', properties: {} },
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

    expect(result).toBe(value);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('normalizes accepted tool-call field aliases for valid MCP prompts', async () => {
    const result = await materializeMcpValue({
      purpose: 'Search companies',
      value: JSON.stringify({
        functionName: 'search_companies',
        parameters: { query: 'cloud', limit: 1 },
      }),
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result)).toEqual({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 1 },
    });
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('defaults missing or invalid args to an empty object for valid no-arg tools', async () => {
    const result = await materializeMcpValue({
      purpose: 'List industries',
      value: JSON.stringify({
        name: 'list_industries',
        arguments: ['ignored'],
      }),
      tools: [listIndustriesTool],
    });

    expect(JSON.parse(result)).toEqual({
      tool: 'list_industries',
      args: {},
    });
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('returns the original value when no MCP tools are available', async () => {
    await expect(
      materializeMcpValue({
        value: 'plain text',
        tools: [],
      }),
    ).resolves.toBe('plain text');
    await expect(
      materializeMcpValue({
        value: { prompt: 'plain text' },
        tools: [],
      }),
    ).resolves.toBe('{"prompt":"plain text"}');
    await expect(
      materializeMcpValue({
        value: undefined,
        tools: [],
      }),
    ).resolves.toBe('');
  });

  it('uses the inference provider to materialize plain text intents', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"search_companies","args":{"query":"clean energy","limit":3}}',
    });

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find clean energy companies.',
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result)).toEqual({
      tool: 'search_companies',
      args: { query: 'clean energy', limit: 3 },
    });
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Find clean energy companies.'),
    );
  });

  it('accepts MCP JSON from array provider outputs', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: ['Some preface.', '{"tool":"search_companies","args":{"query":"cloud","limit":2}}'],
    });

    const result = await materializeMcpValue({
      provider,
      purpose: 'Search companies',
      value: 'Find cloud companies.',
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result)).toEqual({
      tool: 'search_companies',
      args: { query: 'cloud', limit: 2 },
    });
  });

  it('uses the inference provider to repair schema-invalid MCP prompts', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"search_companies","args":{"query":"Find cloud companies.","limit":1}}',
    });

    const result = await materializeMcpValue({
      provider,
      intentValue: 'Find cloud companies.',
      purpose: 'Search companies',
      value: JSON.stringify({ tool: 'search_companies', args: { limit: 1 } }),
      tools: [searchCompaniesTool],
    });

    expect(JSON.parse(result)).toEqual({
      tool: 'search_companies',
      args: {
        query: 'Find cloud companies.',
        limit: 1,
      },
    });
  });

  it('throws when non-JSON MCP input has no inference provider', async () => {
    await expect(
      materializeMcpValue({
        purpose: 'Search companies',
        value: 'Find clean energy companies.',
        tools: [searchCompaniesTool],
      }),
    ).rejects.toThrow('inference provider is required');
  });

  it('throws when provider repair picks an unknown tool', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"unknown_tool","args":{}}',
    });

    await expect(
      materializeMcpValue({
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
      }),
    ).rejects.toThrow('Failed to materialize MCP value');
  });

  it('throws when provider repair throws', async () => {
    vi.mocked(provider.callApi).mockRejectedValueOnce(new Error('Missing API key'));

    await expect(
      materializeMcpValue({
        provider,
        purpose: 'Search companies',
        value: 'Find clean energy companies.',
        tools: [searchCompaniesTool],
      }),
    ).rejects.toThrow('Failed to materialize MCP value');
  });

  it('throws when provider repair returns an error response', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      error: 'No JSON object returned',
    });

    await expect(
      materializeMcpValue({
        provider,
        purpose: 'Search companies',
        value: 'Find clean energy companies.',
        tools: [searchCompaniesTool],
      }),
    ).rejects.toThrow('Failed to materialize MCP value');
  });

  it('throws when provider repair chooses schema-invalid args', async () => {
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      output: '{"tool":"search_companies","args":{"limit":3}}',
    });

    await expect(
      materializeMcpValue({
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
      }),
    ).rejects.toThrow('Failed to materialize MCP value');
  });
});
