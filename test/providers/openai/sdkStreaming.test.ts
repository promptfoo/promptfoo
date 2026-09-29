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
    const createdEvent = {
      type: 'response.created',
      response: { ...terminalEvent.response, status: 'in_progress' },
    };
    const client = new OpenAI({
      apiKey: 'fixture-key',
      fetch: async () =>
        new Response(
          `event: response.created\ndata: ${JSON.stringify(createdEvent)}\n\nevent: response.completed\ndata: ${JSON.stringify(terminalEvent)}${suffix}`,
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const stream = client.responses.stream({
      model: 'fixture-model',
      input: 'Fixture input',
    });

    const events: unknown[] = [];
    stream.on('response.completed', (event) => events.push(event));
    await stream.done();

    expect(events).toEqual([terminalEvent]);
  });
});
