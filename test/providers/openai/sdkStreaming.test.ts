import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

describe('OpenAI SDK streaming', () => {
  it.each(['\n\n', ''])('preserves the terminal SSE event with suffix %j', async (suffix) => {
    // The streaming WebSocket example uses the SDK's Responses stream. Servers may
    // close immediately after their last event instead of sending a blank line.
    const terminalEvent = {
      type: 'response.completed',
      response: { id: 'resp_fixture', status: 'completed', output: [] },
    };
    const client = new OpenAI({
      apiKey: 'fixture-key',
      fetch: async () =>
        new Response(`event: response.completed\ndata: ${JSON.stringify(terminalEvent)}${suffix}`, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    });
    const stream = await client.responses.create({
      model: 'fixture-model',
      input: 'Fixture input',
      stream: true,
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual([terminalEvent]);
  });
});
