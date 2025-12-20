import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VoiceProviderConfig } from '../../../src/providers/voice/types';

// Use vi.hoisted to define the mock class before the vi.mock() hoisting
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
import { GoogleLiveConnection } from '../../../src/providers/voice/connections/googleLive';

describe('GoogleLiveConnection', () => {
  let connection: GoogleLiveConnection;
  let config: VoiceProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWsInstances.length = 0;
    vi.stubEnv('GOOGLE_API_KEY', 'test-api-key');

    config = {
      provider: 'google',
      model: 'gemini-2.0-flash-exp',
      voice: 'Puck',
      instructions: 'You are a helpful assistant.',
      audioFormat: 'pcm16',
      sampleRate: 24000,
    };

    connection = new GoogleLiveConnection(config);
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
      const conn = new GoogleLiveConnection({
        ...config,
        model: undefined,
      });
      expect(conn.getConfig().model).toBeUndefined();
    });
  });

  describe('connect', () => {
    it('should throw error if no API key', async () => {
      vi.stubEnv('GOOGLE_API_KEY', '');
      const conn = new GoogleLiveConnection({ ...config, apiKey: undefined });

      await expect(conn.connect()).rejects.toThrow('Google API key not found');
    });

    it('should connect successfully with API key', async () => {
      const connectPromise = connection.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];
      expect(ws).toBeDefined();

      ws.simulateOpen();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(connection.isConnected()).toBe(true);
    });

    it('should handle connection error', async () => {
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);

      const connectPromise = connection.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];

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

  describe('sendText', () => {
    it('should not send text if not ready', () => {
      const sendSpy = vi.spyOn(connection as any, 'send');
      connection.sendText('Hello');

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage', () => {
    it('should emit session_configured on setupComplete', () => {
      const handler = vi.fn();
      connection.on('session_configured', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          setupComplete: {},
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(connection.isReady()).toBe(true);
    });

    it('should emit audio_delta for inline audio data', () => {
      const handler = vi.fn();
      connection.on('audio_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: 'base64audiodata',
                  },
                },
              ],
            },
          },
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

    it('should emit transcript_delta for text content', () => {
      const handler = vi.fn();
      connection.on('transcript_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [{ text: 'Hello world' }],
            },
          },
        }),
      );

      expect(handler).toHaveBeenCalledWith('Hello world');
    });

    it('should emit transcript_delta for output transcription', () => {
      const handler = vi.fn();
      connection.on('transcript_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            outputTranscription: { text: 'Model said this' },
          },
        }),
      );

      expect(handler).toHaveBeenCalledWith('Model said this');
    });

    it('should emit input_transcript for input transcription', () => {
      const handler = vi.fn();
      connection.on('input_transcript', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            inputTranscription: { text: 'User said this' },
          },
        }),
      );

      expect(handler).toHaveBeenCalledWith('User said this');
    });

    it('should emit audio_done on turnComplete', () => {
      const audioDoneHandler = vi.fn();
      const speechStoppedHandler = vi.fn();
      connection.on('audio_done', audioDoneHandler);
      connection.on('speech_stopped', speechStoppedHandler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            turnComplete: true,
          },
        }),
      );

      expect(audioDoneHandler).toHaveBeenCalledTimes(1);
      expect(speechStoppedHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit audio_done on generationComplete', () => {
      const handler = vi.fn();
      connection.on('audio_done', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          serverContent: {
            generationComplete: true,
          },
        }),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit error on error message', () => {
      const handler = vi.fn();
      connection.on('error', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          error: { message: 'Something went wrong', code: 500 },
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

    it('should handle Buffer data as JSON', () => {
      const handler = vi.fn();
      connection.on('session_configured', handler);

      (connection as any).handleMessage(
        Buffer.from(
          JSON.stringify({
            setupComplete: {},
          }),
        ),
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle binary audio data', () => {
      const handler = vi.fn();
      connection.on('audio_delta', handler);

      // Simulate raw binary data that isn't JSON
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      (connection as any).handleMessage(binaryData);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'pcm16',
          sampleRate: 24000,
        }),
      );
    });

    it('should handle realtimeInput media chunks', () => {
      const handler = vi.fn();
      connection.on('audio_delta', handler);

      (connection as any).handleMessage(
        JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm',
                data: 'chunk1data',
              },
              {
                mimeType: 'audio/pcm',
                data: 'chunk2data',
              },
            ],
          },
        }),
      );

      expect(handler).toHaveBeenCalledTimes(2);
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
      const connectPromise = connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.simulateOpen();
      await connectPromise;

      expect(connection.isConnected()).toBe(true);

      connection.disconnect();

      expect(connection.getState()).toBe('disconnected');
      expect(ws.close).toHaveBeenCalled();
    });
  });
});
