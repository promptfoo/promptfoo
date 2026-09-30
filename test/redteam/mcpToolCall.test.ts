import { describe, expect, it } from 'vitest';
import { normalizeMcpToolCall } from '../../src/redteam/mcpToolCall';

const tools = [{ name: 'book_flight', inputSchema: { type: 'object' } }];

describe('MCP tool call argument envelopes', () => {
  it.each(['toolName', 'function', 'functionName', 'name'])(
    'rejects conflicting or malformed tool-name alias %s',
    (field) => {
      const allowed = [...tools, { name: 'cancel_flight' }];
      for (const value of ['cancel_flight', 'unknown', '', 1, null, undefined]) {
        expect(
          normalizeMcpToolCall({ tool: 'book_flight', [field]: value }, allowed),
        ).toBeUndefined();
      }
      expect(
        normalizeMcpToolCall({ tool: 'book_flight', [field]: 'book_flight' }, allowed),
      ).toEqual({ tool: 'book_flight', args: {} });
    },
  );

  it.each([
    'http://json-schema.org/draft-07/schema#',
    'https://json-schema.org/draft/2020-12/schema',
    'https://json-schema.org/draft/2020-12/schema#',
    'https://json-schema.org/draft/2019-09/schema',
    'https://json-schema.org/draft/2019-09/schema#',
  ])('validates the declared schema dialect %s', ($schema) => {
    const typedTools = [
      {
        name: 'book_flight',
        inputSchema: {
          $schema,
          type: 'object',
          properties: { destination: { type: 'string' } },
          required: ['destination'],
          additionalProperties: false,
        },
      },
    ];
    expect(
      normalizeMcpToolCall({ tool: 'book_flight', args: { destination: 'SFO' } }, typedTools),
    ).toEqual({ tool: 'book_flight', args: { destination: 'SFO' } });
    expect(
      normalizeMcpToolCall({ tool: 'book_flight', args: { destination: 7 } }, typedTools),
    ).toBeUndefined();
  });

  it.each(
    [
      'http://json-schema.org/draft-07/schema#',
      'https://json-schema.org/draft/2019-09/schema',
      'https://json-schema.org/draft/2020-12/schema',
    ].flatMap(($schema) => ['root', 'nested'].map((location) => ({ $schema, location }))),
  )('isolates $location schema IDs between tools using $schema', ({ $schema, location }) => {
    const sharedId = `https://example.test/${encodeURIComponent($schema)}/${location}`;
    const typedTools = ['string', 'number'].map((type) => ({
      name: `lookup_${type}`,
      inputSchema: {
        $schema,
        $id: location === 'root' ? sharedId : `${sharedId}/${type}`,
        type: 'object',
        definitions: { value: { ...(location === 'nested' && { $id: sharedId }), type } },
        properties: { value: { $ref: location === 'nested' ? sharedId : '#/definitions/value' } },
        required: ['value'],
        additionalProperties: false,
      },
    }));
    for (const [type, value, invalid] of [
      ['string', 'Ada', 1],
      ['number', 1, 'Ada'],
      ['string', 'Grace', 2],
      ['number', 2, 'Grace'],
    ] as const) {
      const call = { tool: `lookup_${type}`, args: { value } };
      expect(normalizeMcpToolCall(call, typedTools)).toEqual(call);
      expect(
        normalizeMcpToolCall({ ...call, args: { value: invalid } }, typedTools),
      ).toBeUndefined();
    }
  });

  it('enforces draft 2020-12 tuple keywords', () => {
    const tupleTools = [
      {
        name: 'book_flight',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            route: {
              type: 'array',
              prefixItems: [{ type: 'string' }, { type: 'number' }],
              items: false,
            },
          },
          required: ['route'],
        },
      },
    ];
    expect(
      normalizeMcpToolCall({ tool: 'book_flight', args: { route: ['SFO', 2] } }, tupleTools),
    ).toBeDefined();
    expect(
      normalizeMcpToolCall({ tool: 'book_flight', args: { route: [2, 'SFO'] } }, tupleTools),
    ).toBeUndefined();
    expect(
      normalizeMcpToolCall({ tool: 'book_flight', args: { route: ['SFO', 2, 3] } }, tupleTools),
    ).toBeUndefined();
  });

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
