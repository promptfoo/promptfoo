import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceProviderConfig } from '../../../src/providers/voice/types';

// Use vi.hoisted to define the mock class before the vi.mock() hoisting
// Avoid importing EventEmitter since that also gets hoisted
const { MockWebSocket, mockWsInstances } = vi.hoisted(() => {
  const instances: any[] = [];

  class MockWS {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1; // OPEN
    close = vi.fn();
    send = vi.fn();
    ping = vi.fn();
    pong = vi.fn();

    // Simple event emitter implementation
    private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

    constructor(_url: string, _options?: object) {
      instances.push(this);
    }

    on(event: string, callback: (...args: any[]) => void) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(callback);
      return this;
    }

    emit(event: string, ...args: any[]) {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.forEach((cb) => cb(...args));
      }
      return true;
    }

    simulateOpen() {
      this.emit('open');
    }

    simulateMessage(data: string | Buffer) {
      this.emit('message', data);
    }

    simulateError(error: Error) {
      this.emit('error', error);
    }

    simulateClose(code: number, reason: string) {
      this.readyState = 3; // CLOSED
      this.emit('close', code, Buffer.from(reason));
    }
  }

  return { MockWebSocket: MockWS, mockWsInstances: instances };
});

vi.mock('ws', () => {
  return {
    default: MockWebSocket,
  };
});

// Import after mocking
import { OpenAIRealtimeConnection } from '../../../src/providers/voice/connections/openaiRealtime';

describe('OpenAIRealtimeConnection', () => {
  let connection: OpenAIRealtimeConnection;
  let config: VoiceProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWsInstances.length = 0;
    vi.stubEnv('OPENAI_API_KEY', 'test-api-key');

    config = {
      provider: 'openai',
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      instructions: 'You are a helpful assistant.',
      audioFormat: 'pcm16',
      sampleRate: 24000,
      turnDetection: {
        mode: 'server_vad',
        silenceThresholdMs: 500,
        vadThreshold: 0.5,
        minTurnDurationMs: 100,
        maxTurnDurationMs: 30000,
        prefixPaddingMs: 300,
      },
    };

    connection = new OpenAIRealtimeConnection(config);
  });

  afterEach(() => {
    connection.disconnect();
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(connection.getConfig()).toEqual(config);
      expect(connection.getState()).toBe('disconnected');
      expect(connection.getSessionId()).toBeNull();
    });

    it('should use default model if not provided', () => {
      const conn = new OpenAIRealtimeConnection({
        ...config,
        model: undefined,
      });
      expect(conn.getConfig().model).toBeUndefined();
    });
  });

  describe('connect', () => {
    it('should throw error if no API key', async () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      const conn = new OpenAIRealtimeConnection({ ...config, apiKey: undefined });

      await expect(conn.connect()).rejects.toThrow('OpenAI API key not found');
    });

    it('should connect successfully with API key', async () => {
      const connectPromise = connection.connect();

      // Wait for WebSocket to be created
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];
      expect(ws).toBeDefined();

      // Simulate successful connection
      ws.simulateOpen();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(connection.isConnected()).toBe(true);
    });

    it('should handle connection error', async () => {
      // Add error listener to prevent unhandled error event
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);

      const connectPromise = connection.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];

      // Simulate error during connection
      ws.simulateError(new Error('Connection failed'));

      await expect(connectPromise).rejects.toThrow('Connection failed');
    });
  });

  describe('sendAudio', () => {
    it('should not send if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.sendAudio({
        data: 'base64audio',
        timestamp: Date.now(),
        format: 'pcm16',
        sampleRate: 24000,
      });

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('commitAudio', () => {
    it('should not commit if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.commitAudio();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('requestResponse', () => {
    it('should not request if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.requestResponse();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('cancelResponse', () => {
    it('should not cancel if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.cancelResponse();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('clearAudioBuffer', () => {
    it('should not clear if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.clearAudioBuffer();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage', () => {
    it('should emit session_configured on session.created', () => {
      const handler = vi.fn();
      connection.on('session_configured', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'session.created',
          session: { id: 'test-session-id' },
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(connection.getSessionId()).toBe('test-session-id');
    });

    it('should emit session_configured on session.updated', () => {
      const handler = vi.fn();
      connection.on('session_configured', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'session.updated',
          session: { id: 'updated-session-id' },
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(connection.getSessionId()).toBe('updated-session-id');
    });

    it('should emit audio_delta on response.audio.delta', () => {
      const handler = vi.fn();
      connection.on('audio_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'response.audio.delta',
          delta: 'base64audiodata',
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'base64audiodata',
          format: 'pcm16',
          sampleRate: 24000,
        }),
      );
    });

    it('should emit audio_done on response.audio.done', () => {
      const handler = vi.fn();
      connection.on('audio_done', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'response.audio.done',
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit transcript_delta on response.audio_transcript.delta', () => {
      const handler = vi.fn();
      connection.on('transcript_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'response.audio_transcript.delta',
          delta: 'Hello ',
        }),
      );

      expect(handler).toHaveBeenCalledWith('Hello ');
    });

    it('should emit transcript_done on response.audio_transcript.done', () => {
      const handler = vi.fn();
      connection.on('transcript_done', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'response.audio_transcript.done',
          transcript: 'Hello world',
        }),
      );

      expect(handler).toHaveBeenCalledWith('Hello world');
    });

    it('should emit input_transcript on conversation.item.input_audio_transcription.completed', () => {
      const handler = vi.fn();
      connection.on('input_transcript', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'User said this',
        }),
      );

      expect(handler).toHaveBeenCalledWith('User said this');
    });

    it('should emit speech_started on input_audio_buffer.speech_started', () => {
      const handler = vi.fn();
      connection.on('speech_started', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'input_audio_buffer.speech_started',
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit speech_stopped on input_audio_buffer.speech_stopped', () => {
      const handler = vi.fn();
      connection.on('speech_stopped', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'input_audio_buffer.speech_stopped',
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit error on error message', () => {
      const handler = vi.fn();
      connection.on('error', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          type: 'error',
          error: { message: 'Something went wrong' },
        }),
      );

      expect(handler).toHaveBeenCalledWith(expect.any(Error));
      expect(handler.mock.calls[0][0].message).toBe('Something went wrong');
    });

    it('should handle invalid JSON gracefully', () => {
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);

      // Should not throw
      (connection as any).handleMessage('not valid json');

      // Should not emit error for parse failure (just logs)
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should handle Buffer data', () => {
      const handler = vi.fn();
      connection.on('session_configured', handler);

      (connection as any).handleMessage(
        Buffer.from(
          JSON.stringify({
            type: 'session.created',
            session: { id: 'buffer-session' },
          }),
        ),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('should return correct ready state', () => {
      expect(connection.isReady()).toBe(false);

      (connection as any).setReady();
      expect(connection.isReady()).toBe(true);
    });

    it('should return correct connected state', () => {
      expect(connection.isConnected()).toBe(false);

      (connection as any).state = 'connected';
      expect(connection.isConnected()).toBe(true);

      (connection as any).state = 'ready';
      expect(connection.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should reset state on disconnect', async () => {
      // Connect first
      const connectPromise = connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.simulateOpen();
      await connectPromise;

      expect(connection.isConnected()).toBe(true);

      // Disconnect
      connection.disconnect();

      expect(connection.getState()).toBe('disconnected');
      expect(ws.close).toHaveBeenCalled();
    });
  });
});
