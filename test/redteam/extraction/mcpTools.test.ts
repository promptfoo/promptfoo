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

  it('ignores required ordering in nested schemas without changing literal arrays', async () => {
    const schema = (required: string[], values: string[]) => ({
      type: 'object' as const,
      properties: {
        booking: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required,
        },
        literal: { enum: [{ required: values }] },
      },
    });
    const first = { ...query, inputSchema: schema(['from', 'to'], ['a', 'b']) };
    const same = { ...query, inputSchema: schema(['to', 'from'], ['a', 'b']) };
    const different = { ...query, inputSchema: schema(['from', 'to'], ['b', 'a']) };
    await expect(
      extractMcpTools([provider('first', [first]), provider('same', [same])]),
    ).resolves.toEqual([first]);
    await expect(
      extractMcpTools([provider('first', [first]), provider('different', [different])]),
    ).rejects.toThrow('conflicting input schemas');
    expect(same.inputSchema.properties.booking.required).toEqual(['to', 'from']);
  });

  it.each(['type', 'dependentRequired', 'dependencies'])(
    'ignores order in schema %s arrays but preserves literal values',
    async (keyword) => {
      const schema = (members: string[], literal: string[]) => ({
        type: 'object' as const,
        properties: {
          value: { [keyword]: keyword === 'type' ? members : { first: members } },
          literal: { const: { [keyword]: literal } },
        },
      });
      const first = { ...query, inputSchema: schema(['number', 'string'], ['a', 'b']) };
      const same = { ...query, inputSchema: schema(['string', 'number'], ['a', 'b']) };
      await expect(
        extractMcpTools([provider('first', [first]), provider('same', [same])]),
      ).resolves.toEqual([first]);
      const different = { ...query, inputSchema: schema(['number', 'string'], ['b', 'a']) };
      await expect(
        extractMcpTools([provider('first', [first]), provider('different', [different])]),
      ).rejects.toThrow('conflicting input schemas');
      expect(same.inputSchema).toEqual(schema(['string', 'number'], ['a', 'b']));
    },
  );

  it.each(['allOf', 'anyOf', 'oneOf'])(
    'ignores %s member ordering while preserving literal arrays and duplicate members',
    async (keyword) => {
      const members = [
        { type: 'number', minimum: 0 },
        { type: 'string', minLength: 1 },
      ];
      const schema = (children: object[], literal = ['a', 'b']) => ({
        type: 'object' as const,
        properties: { value: { [keyword]: children }, literal: { const: literal } },
      });
      const first = { ...query, inputSchema: schema(members) };
      const same = {
        ...query,
        inputSchema: schema([
          { minLength: 1, type: 'string' },
          { minimum: 0, type: 'number' },
        ]),
      };
      await expect(
        extractMcpTools([provider('first', [first]), provider('same', [same])]),
      ).resolves.toEqual([first]);
      for (const different of [schema(members, ['b', 'a']), schema([...members, members[0]])]) {
        await expect(
          extractMcpTools([
            provider('first', [first]),
            provider('different', [{ ...query, inputSchema: different }]),
          ]),
        ).rejects.toThrow('conflicting input schemas');
      }
    },
  );

  it('preserves tools from working providers when another provider cannot connect', async () => {
    const unavailable = provider('unavailable', []);
    vi.mocked(unavailable.getAvailableTools).mockRejectedValue(new Error('Connection failed'));
    await expect(extractMcpTools([unavailable, provider('available', [query])])).resolves.toEqual([
      query,
    ]);
  });
});
