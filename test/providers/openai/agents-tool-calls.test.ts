import { describe, expect, it } from 'vitest';
import { extractToolCalls } from '../../../src/providers/openai/agents';

describe('extractToolCalls', () => {
  it('projects function calls by call ID and excludes tool results', () => {
    expect(
      extractToolCalls([
        {
          type: 'tool_call_item',
          rawItem: {
            type: 'function_call',
            call_id: 'call_inventory_1',
            name: 'check_inventory',
            arguments: '{"playerId":"player1"}',
          },
        },
        {
          type: 'tool_call_item',
          rawItem: {
            type: 'function_call',
            call_id: 'call_inventory_2',
            name: 'check_inventory',
            arguments: '{"playerId":"player2"}',
          },
        },
        {
          type: 'tool_call_output_item',
          rawItem: { type: 'function_call_output', call_id: 'call_inventory_1', output: 'secret' },
        },
        { type: 'message_output_item', rawItem: { type: 'message', content: 'Done' } },
      ]),
    ).toEqual([
      {
        callId: 'call_inventory_1',
        name: 'check_inventory',
        arguments: { playerId: 'player1' },
      },
      {
        callId: 'call_inventory_2',
        name: 'check_inventory',
        arguments: { playerId: 'player2' },
      },
    ]);
  });

  it('ignores malformed items and preserves unparseable arguments as strings', () => {
    expect(
      extractToolCalls([
        null,
        { type: 'tool_call_item', rawItem: { type: 'function_call', name: 'missing-id' } },
        {
          type: 'tool_call_item',
          rawItem: {
            type: 'function_call',
            call_id: 'call_1',
            name: 'lookup',
            arguments: '{invalid',
          },
        },
      ]),
    ).toEqual([{ callId: 'call_1', name: 'lookup', arguments: '{invalid' }]);
  });
});
