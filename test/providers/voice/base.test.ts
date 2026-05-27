import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseVoiceConnection, waitForEvent } from '../../../src/providers/voice/connections/base';
import type WebSocket from 'ws';

import type { AudioChunk, VoiceProviderConfig } from '../../../src/providers/voice/types';

class MockSocket extends EventEmitter {
  readyState = 1;
  close = vi.fn();
  ping = vi.fn();
  pong = vi.fn();
  send = vi.fn();
}

class TestVoiceConnection extends BaseVoiceConnection {
  messages: Array<Buffer | string> = [];

  async connect(): Promise<void> {}

  async configureSession(): Promise<void> {}

  sendAudio(_chunk: AudioChunk): void {}

  commitAudio(): void {}

  requestResponse(): void {}

  attachSocket(socket: MockSocket): void {
    this.ws = socket as unknown as WebSocket;
    this.setupWebSocketHandlers(this.ws);
  }

  sendMessage(message: object): boolean {
    return this.send(message);
  }

  setState(state: 'disconnected' | 'connecting' | 'connected' | 'ready' | 'error'): void {
    this.state = state;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  markReady(): void {
    this.setReady();
  }

  startConnectionTimeout(ms: number): void {
    this.setConnectionTimeout(ms);
  }

  setConnectingReject(reject: (error: Error) => void): void {
    this.state = 'connecting';
    this.setPendingConnectionReject(reject);
  }

  startPing(ms: number): void {
    this.startPingInterval(ms);
  }

  apiKey(): string {
    return this.getApiKey();
  }

  protected handleMessage(data: Buffer | string): void {
    if (data.toString() === 'bad') {
      throw new Error('bad message');
    }
    this.messages.push(data);
  }
}

const config: VoiceProviderConfig = {
  provider: 'openai',
  audioFormat: 'pcm16',
};

describe('BaseVoiceConnection', () => {
  let connection: TestVoiceConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    connection = new TestVoiceConnection(config);
  });

  afterEach(() => {
    connection.disconnect();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('tracks state, config, and default unsupported operations', () => {
    expect(connection.getState()).toBe('disconnected');
    expect(connection.getSessionId()).toBeNull();
    expect(connection.getConfig()).toEqual(config);
    expect(connection.isReady()).toBe(false);

    connection.setState('connected');
    connection.setSessionId('session-1');
    connection.updateConfig({ model: 'voice-model', apiKey: 'explicit-key' });
    connection.cancelResponse();
    connection.clearAudioBuffer();

    expect(connection.isConnected()).toBe(true);
    expect(connection.getSessionId()).toBe('session-1');
    expect(connection.getConfig()).toEqual(
      expect.objectContaining({ model: 'voice-model', apiKey: 'explicit-key' }),
    );
    expect(connection.apiKey()).toBe('explicit-key');

    const ready = vi.fn();
    connection.on('ready', ready);
    connection.markReady();
    expect(connection.isReady()).toBe(true);
    expect(ready).toHaveBeenCalled();
  });

  it('routes WebSocket lifecycle events and JSON sends', () => {
    const socket = new MockSocket();
    const closed = vi.fn();
    const errors = vi.fn();
    connection.on('close', closed);
    connection.on('error', errors);
    connection.attachSocket(socket);

    socket.emit('message', Buffer.from('hello'));
    expect(connection.messages).toEqual([Buffer.from('hello')]);
    expect(connection.sendMessage({ type: 'ping' })).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('{"type":"ping"}');

    socket.emit('ping');
    expect(socket.pong).toHaveBeenCalled();

    socket.emit('message', Buffer.from('bad'));
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad message' }));
    expect(connection.getState()).toBe('error');

    connection.setState('connected');
    socket.emit('close', 1000, Buffer.from('done'));
    expect(closed).toHaveBeenCalled();
    expect(connection.getState()).toBe('disconnected');
  });

  it('rejects a pending connection when the socket closes before opening', () => {
    const socket = new MockSocket();
    const reject = vi.fn();
    connection.setConnectingReject(reject);
    connection.attachSocket(socket);

    socket.emit('close', 1006, Buffer.from('handshake failed'));

    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'WebSocket closed while connecting (1006): handshake failed',
      }),
    );
    expect(connection.getState()).toBe('disconnected');
  });

  it('handles closed sockets, send errors, disconnect errors, and socket errors', () => {
    const errors = vi.fn();
    connection.on('error', errors);

    expect(connection.sendMessage({ type: 'offline' })).toBe(false);

    const socket = new MockSocket();
    connection.attachSocket(socket);
    socket.readyState = 3;
    expect(connection.sendMessage({ type: 'closed' })).toBe(false);

    socket.readyState = 1;
    socket.send.mockImplementationOnce(() => {
      throw new Error('send failed');
    });
    expect(connection.sendMessage({ type: 'throw' })).toBe(false);

    socket.emit('error', new Error('socket failed'));
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'socket failed' }));

    socket.close.mockImplementationOnce(() => {
      throw new Error('close failed');
    });
    connection.disconnect();
    expect(connection.getState()).toBe('disconnected');
  });

  it('cleans up connection and ping timers', async () => {
    const socket = new MockSocket();
    connection.attachSocket(socket);
    connection.setState('connecting');
    connection.on('error', vi.fn());
    connection.startConnectionTimeout(20);
    await vi.advanceTimersByTimeAsync(20);
    expect(connection.getState()).toBe('disconnected');

    const pingConnection = new TestVoiceConnection(config);
    pingConnection.attachSocket(socket);
    pingConnection.startPing(10);
    await vi.advanceTimersByTimeAsync(10);
    expect(socket.ping).toHaveBeenCalled();

    socket.readyState = 3;
    await vi.advanceTimersByTimeAsync(10);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    pingConnection.disconnect();
  });

  it('resolves and rejects waitForEvent', async () => {
    const emitter = new EventEmitter();
    const valuePromise = waitForEvent<string>(emitter, 'value', 50);
    emitter.emit('value', 'done');
    await expect(valuePromise).resolves.toBe('done');

    const errorPromise = waitForEvent(emitter, 'value', 50);
    emitter.emit('error', new Error('failed'));
    await expect(errorPromise).rejects.toThrow('failed');

    const timeoutPromise = waitForEvent(emitter, 'missing', 50);
    const timeoutExpectation = expect(timeoutPromise).rejects.toThrow(
      'Timeout waiting for event: missing',
    );
    await vi.advanceTimersByTimeAsync(50);
    await timeoutExpectation;
  });

  it('loads provider API keys from supported environments', () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('GOOGLE_API_KEY', 'google-key');

    expect(new TestVoiceConnection(config).apiKey()).toBe('openai-key');
    expect(new TestVoiceConnection({ ...config, provider: 'google' }).apiKey()).toBe('google-key');
    expect(new TestVoiceConnection({ ...config, provider: 'bedrock' }).apiKey()).toBe('');
  });
});
