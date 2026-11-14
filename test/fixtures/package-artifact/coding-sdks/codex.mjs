#!/usr/bin/env node

// Exercise the real SDK's subprocess protocol without contacting a model service.
let prompt = '';
for await (const chunk of process.stdin) {
  prompt += chunk;
}
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
send({ type: 'thread.started', thread_id: 'fixture-thread' });
send({ type: 'turn.started' });
if (prompt.includes('fixture error')) {
  send({ type: 'turn.failed', error: { message: 'fixture request failed' } });
} else {
  send({
    type: 'item.completed',
    item: { id: 'fixture-item', type: 'agent_message', text: 'local SDK fixture response' },
  });
  send({
    type: 'turn.completed',
    usage: { input_tokens: 3, output_tokens: 5, cached_input_tokens: 0 },
  });
}
