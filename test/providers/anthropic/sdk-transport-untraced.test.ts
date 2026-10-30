import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';

// No tracer provider or propagator is registered in this file, as when tracing is off.
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('Anthropic Messages SDK transport without tracing', () => {
  it('sends no trace context headers', async () => {
    const received: IncomingHttpHeaders[] = [];
    server = createServer((request, response) => {
      received.push(request.headers);
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_1' });
        response.end(
          JSON.stringify({
            id: 'msg_local',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'pong' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 3, output_tokens: 1 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      config: {
        apiKey: 'local-qa-key',
        apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      },
    });

    // An evaluator trace context alone, without OpenTelemetry set up, must not leak out.
    const result = await provider.callApi('ping', {
      prompt: { raw: 'ping', label: 'ping' },
      vars: {},
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    });

    expect(result.output).toBe('pong');
    expect(received).toHaveLength(1);
    expect(received[0]).not.toHaveProperty('traceparent');
    expect(received[0]).not.toHaveProperty('tracestate');
  });
});
