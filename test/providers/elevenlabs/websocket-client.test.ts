import { EventEmitter } from 'events';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ElevenLabsWebSocketClient,
  type StreamingMessage,
} from '../../../src/providers/elevenlabs/websocket-client';

const sockets = vi.hoisted(() => [] as Array<EventEmitter & { readyState: number }>);

vi.mock('ws', async () => {
  const { EventEmitter } = await import('events');
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;
    readyState = FakeWebSocket.OPEN;
    send = vi.fn();
    ping = vi.fn();
    close = vi.fn();
    constructor() {
      super();
      sockets.push(this);
      queueMicrotask(() => this.emit('open'));
    }
  }
  return { default: FakeWebSocket };
});

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  sockets.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function connectClient() {
  const client = new ElevenLabsWebSocketClient({ apiKey: 'fixture-key' });
  await client.connect('/v1/text-to-speech/fixture-voice/stream-input');
  return { client, socket: sockets[0] };
}

it('reports the final output message as the end of the stream', async () => {
  const { client, socket } = await connectClient();
  const messages: StreamingMessage[] = [];
  client.onMessage((message) => messages.push(message));

  const audio = Buffer.from('audio').toString('base64');
  socket.emit('message', Buffer.from(JSON.stringify({ audio, isFinal: null })));
  socket.emit('message', Buffer.from(JSON.stringify({ audio: null, isFinal: true })));

  expect(messages.map(({ type }) => type)).toEqual(['audio', 'flush']);
  client.close();
});

it('passes the close code and reason to the close handler', async () => {
  const { client, socket } = await connectClient();
  const onClose = vi.fn();
  client.onClose(onClose);

  socket.emit('close', 1008, Buffer.from('quota_exceeded'));

  expect(onClose).toHaveBeenCalledExactlyOnceWith(1008, 'quota_exceeded');
});

it('stops reporting closes after the client closes the socket', async () => {
  const { client, socket } = await connectClient();
  const onClose = vi.fn();
  client.onClose(onClose);

  client.close();
  socket.emit('close', 1000, Buffer.from(''));

  expect(onClose).not.toHaveBeenCalled();
});
