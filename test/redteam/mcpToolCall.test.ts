import { describe, expect, it } from 'vitest';
import { normalizeMcpToolCall } from '../../src/redteam/mcpToolCall';

const tools = [{ name: 'book_flight', inputSchema: { type: 'object' } }];

describe('MCP tool call argument envelopes', () => {
  it.each(['args', 'arguments', 'params', 'parameters'])(
    'rejects malformed %s even when the schema permits an empty object',
    (field) => {
      for (const value of [null, undefined, [], 0, false, '{"destination":"SFO"}']) {
        expect(
          normalizeMcpToolCall({ tool: 'book_flight', [field]: value }, tools),
        ).toBeUndefined();
        expect(
          normalizeMcpToolCall({ tool: 'book_flight', args: {}, [field]: value }, tools),
        ).toBeUndefined();
      }
      expect(
        normalizeMcpToolCall({ tool: 'book_flight', [field]: { destination: 'SFO' } }, tools),
      ).toEqual({ tool: 'book_flight', args: { destination: 'SFO' } });
    },
  );

  it('accepts equivalent argument aliases and rejects conflicting values', () => {
    const args = { destination: 'SFO', passengers: ['Alice', 'Bob'] };
    for (const field of ['arguments', 'params', 'parameters']) {
      expect(
        normalizeMcpToolCall(
          {
            tool: 'book_flight',
            args,
            [field]: { passengers: ['Alice', 'Bob'], destination: 'SFO' },
          },
          tools,
        ),
      ).toEqual({ tool: 'book_flight', args });
      expect(
        normalizeMcpToolCall(
          { tool: 'book_flight', args, [field]: { ...args, destination: 'LAX' } },
          tools,
        ),
      ).toBeUndefined();
    }
  });

  it('defaults genuinely absent arguments to an empty object', () => {
    expect(normalizeMcpToolCall({ tool: 'book_flight' }, tools)).toEqual({
      tool: 'book_flight',
      args: {},
    });
  });
});
