#!/usr/bin/env node

import { createInterface } from 'node:readline';

// Respond to the real SDK's initialization handshake and one local request.
const input = createInterface({ input: process.stdin });
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
for await (const line of input) {
  const message = JSON.parse(line);
  if (message.type === 'control_request') {
    send({
      type: 'control_response',
      response: { subtype: 'success', request_id: message.request_id, response: {} },
    });
  } else if (message.type === 'user') {
    const failed = JSON.stringify(message.message).includes('fixture error');
    send({
      type: 'result',
      subtype: failed ? 'error_during_execution' : 'success',
      session_id: 'fixture-session',
      uuid: '12345678-1234-1234-1234-123456789abc',
      result: failed ? 'fixture request failed' : 'local SDK fixture response',
      errors: failed ? ['fixture request failed'] : [],
      usage: {
        input_tokens: 3,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 1,
      is_error: failed,
      num_turns: 1,
      permission_denials: [],
    });
    input.close();
    process.stdin.destroy();
    break;
  }
}
