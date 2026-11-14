import { Agent, RunToolCallItem, RunToolCallOutputItem } from '@openai/agents';
import { describe, expect, it } from 'vitest';
import { extractToolCalls } from '../../../src/providers/openai/agents';

const agent = new Agent({ name: 'inventory' });

function toolCall(callId: string, args: string) {
  return new RunToolCallItem(
    { type: 'function_call', callId, name: 'check_inventory', arguments: args },
    agent,
  );
}

describe('extractToolCalls', () => {
  it('projects SDK function calls by call ID and excludes tool results', () => {
    expect(
      extractToolCalls([
        toolCall('call_inventory_1', '{"playerId":"player1"}'),
        toolCall('call_inventory_2', '{"playerId":"player2"}'),
        new RunToolCallOutputItem(
          {
            type: 'function_call_result',
            callId: 'call_inventory_1',
            name: 'check_inventory',
            output: { type: 'text', text: 'secret' },
            status: 'completed',
          },
          agent,
          'secret',
        ),
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

  it('preserves unparseable arguments as strings', () => {
    expect(extractToolCalls([toolCall('call_1', '{invalid')])).toEqual([
      { callId: 'call_1', name: 'check_inventory', arguments: '{invalid' },
    ]);
  });
});
