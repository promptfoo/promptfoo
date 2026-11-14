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

it.each([null, Buffer.from('tail').toString('base64')])(
  'reports the final output message as the end of the stream (audio: %s)',
  async (finalAudio) => {
    const { client, socket } = await connectClient();
    const messages: StreamingMessage[] = [];
    client.onMessage((message) => messages.push(message));

    const audio = Buffer.from('audio').toString('base64');
    socket.emit('message', Buffer.from(JSON.stringify({ audio, isFinal: null })));
    socket.emit('message', Buffer.from(JSON.stringify({ audio: finalAudio, isFinal: true })));

    expect(messages.map(({ type }) => type)).toEqual(
      finalAudio ? ['audio', 'audio', 'flush'] : ['audio', 'flush'],
    );
    client.close();
  },
);

it.each([false, true])(
  'delivers audio and its alignment together (isFinal: %s)',
  async (isFinal) => {
    const { client, socket } = await connectClient();
    const messages: StreamingMessage[] = [];
    client.onMessage((message) => messages.push(message));

    const audio = Buffer.from('tail').toString('base64');
    const alignment = { chars: ['a'], charStartTimesMs: [0], charDurationsMs: [30] };
    socket.emit('message', Buffer.from(JSON.stringify({ audio, alignment, isFinal })));
    client.close();

    const expected: StreamingMessage[] = [
      { type: 'audio', data: audio },
      { type: 'alignment', data: alignment },
    ];
    if (isFinal) {
      expected.push({ type: 'flush' });
    }
    expect(messages).toEqual(expected);
  },
);

it('reports an error instead of completing a failed frame', async () => {
  const { client, socket } = await connectClient();
  const messages: StreamingMessage[] = [];
  client.onMessage((message) => messages.push(message));

  const error = { message: 'Synthesis failed' };
  const audio = Buffer.from('partial').toString('base64');
  socket.emit('message', Buffer.from(JSON.stringify({ audio, error, isFinal: true })));
  client.close();

  expect(messages).toEqual([{ type: 'error', data: error }]);
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
