import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { WebSocketProvider } from '../../src/providers/websocket';

describe('WebSocketProvider URL templates over loopback', () => {
  let server: WebSocketServer | undefined;

  afterEach(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  it.each([
    ['an authority template', 'ws://{{ host }}/ws'],
    ['scheme and port templates', '{{ protocol }}://127.0.0.1:{{ port }}/ws'],
    ['a separator supplied by a scheme expression', 'ws{{ separator }}127.0.0.1:{{ port }}/ws'],
    ['a partial scheme and separator expression', 'w{{ suffix }}127.0.0.1:{{ port }}/ws'],
    ['a whole-URL template', '{{ websocketUrl }}'],
    [
      'a whole-URL template followed by a callback URL',
      '{{ websocketUrl }}?callback=https://example.com',
    ],
    [
      'a boolean-valued constant filter operand',
      '{{ false | default("ws", true) }}://127.0.0.1:{{ port }}/ws',
    ],
    ['an overridden built-in scheme filter', '{{ "HTTP" | lower }}://127.0.0.1:{{ port }}/ws'],
    ['a conditional scheme', '{% if secure %}wss{% else %}ws{% endif %}://127.0.0.1:{{ port }}/ws'],
    [
      'a whitespace-trimmed conditional scheme',
      '{%- if secure -%}wss{%- else -%}ws{%- endif -%}://127.0.0.1:{{ port }}/ws',
    ],
    [
      'a whitespace-trimmed conditional scheme with surrounding spaces',
      '{%- if secure -%} wss {%- else -%} ws {%- endif -%}://127.0.0.1:{{ port }}/ws',
    ],
    [
      'a modulo conditional scheme',
      '{% if value % 2 == 0 %}ws{% else %}wss{% endif %}://127.0.0.1:{{ port }}/ws',
    ],
    [
      'an implicit empty conditional branch',
      '{% if useHttp %}http{% endif %}ws://127.0.0.1:{{ port }}/ws',
    ],
    ['a filtered scheme prefix', '{{ protocolPrefix | default("ws://") }}127.0.0.1:{{ port }}/ws'],
  ])('opens a real WebSocket connection from %s', async (_description, url) => {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');

    const { port } = server.address() as AddressInfo;
    let requestPath: string | undefined;

    server.on('connection', (socket, request) => {
      requestPath = request.url;
      socket.once('message', (message) => {
        socket.send(`loopback:${message.toString()}`);
      });
    });

    const provider = new WebSocketProvider('websocket', {
      config: {
        url,
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });

    const result = await provider.callApi('hello', {
      prompt: { raw: 'hello', label: 'hello' },
      vars: {
        host: `127.0.0.1:${port}`,
        protocol: 'ws',
        websocketUrl: `ws://127.0.0.1:${port}/ws`,
        secure: false,
        useHttp: false,
        value: 2,
        separator: '://',
        suffix: 's://',
        port,
      },
      filters: url.includes('"HTTP" | lower') ? { lower: () => 'ws' } : undefined,
    });

    expect(requestPath).toBe(
      url.includes('?callback=') ? '/ws?callback=https://example.com' : '/ws',
    );
    expect(result).toEqual({ output: 'loopback:hello' });
  });
});
