import { describe, expect, it, vi } from 'vitest';
import { MCPProvider } from '../../../src/providers/mcp';
import { extractMcpTools } from '../../../src/redteam/extraction/mcpTools';

import type { MCPTool } from '../../../src/providers/mcp/types';

function provider(id: string, tools: MCPTool[]) {
  const target = new MCPProvider({ id, config: { enabled: false } });
  vi.spyOn(target, 'getAvailableTools').mockResolvedValue(tools);
  return target;
}

const query: MCPTool = {
  name: 'search',
  description: 'Search records',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
};
const id: MCPTool = {
  name: 'search',
  description: 'Search records',
  inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
};

describe('extractMcpTools', () => {
  it.each([false, true])(
    'rejects conflicting schemas independently of provider order: %s',
    async (reverse) => {
      const targets = [provider('query-target', [query]), provider('id-target', [id])];
      await expect(extractMcpTools(reverse ? targets.reverse() : targets)).rejects.toThrow(
        /search.*conflicting input schemas/,
      );
    },
  );

  it('deduplicates matching schemas despite different key ordering and descriptions', async () => {
    const same: MCPTool = {
      ...query,
      description: 'Another server',
      inputSchema: {
        required: ['query'],
        properties: { query: { type: 'string' } },
        type: 'object',
      },
    };
    await expect(
      extractMcpTools([provider('first', [query]), provider('second', [same])]),
    ).resolves.toEqual([query]);
  });

  it('preserves tools from working providers when another provider cannot connect', async () => {
    const unavailable = provider('unavailable', []);
    vi.mocked(unavailable.getAvailableTools).mockRejectedValue(new Error('Connection failed'));
    await expect(extractMcpTools([unavailable, provider('available', [query])])).resolves.toEqual([
      query,
    ]);
  });
});
