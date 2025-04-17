import WebSocket from 'ws';
import { disableCache, enableCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiRealtimeProvider } from '../../../src/providers/openai/realtime';

// Mock WebSocket
jest.mock('ws');
const MockWebSocket = WebSocket as jest.Mocked<typeof WebSocket>;

// Mock logger
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OpenAI Realtime Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();

    // Set up a common mock implementation for WebSocket
    const mockOn = jest.fn();
    const mockSend = jest.fn();
    const mockClose = jest.fn();

    // Mock WebSocket to immediately trigger events
    (MockWebSocket as any).mockImplementation(() => {
      const ws = {
        on: mockOn,
        send: mockSend,
        close: mockClose,
        once: mockOn, // Add once method which is used by the provider
      };

      // Simulate WebSocket connection events
      setTimeout(() => {
        const handlers = mockOn.mock.calls.reduce((acc: any, [event, handler]) => {
          acc[event] = handler;
          return acc;
        }, {});

        if (handlers.open) {
          handlers.open();
        }

        if (handlers.message) {
          // Simulate message events
          handlers.message(
            Buffer.from(
              JSON.stringify({
                type: 'response.text.done',
                text: 'Hello, world!',
                usage: { total_tokens: 10, input_tokens: 5, output_tokens: 5 },
              }),
            ),
          );

          handlers.message(
            Buffer.from(
              JSON.stringify({
                type: 'response.done',
                response: {
                  usage: { total_tokens: 10, input_tokens: 5, output_tokens: 5 },
                },
              }),
            ),
          );
        }
      }, 0);

      return ws;
    });
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiRealtimeProvider', () => {
    it('should initialize with correct model and config', () => {
      const config = {
        modalities: ['text', 'audio'],
        instructions: 'You are a helpful assistant.',
        voice: 'alloy' as const,
        temperature: 0.7,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17', { config });

      expect(provider.modelName).toBe('gpt-4o-realtime-preview-2024-12-17');
      expect(provider.config).toEqual(config);
    });

    it('should log warning when using unknown model', () => {
      const _provider = new OpenAiRealtimeProvider('unknown-realtime-model');
      expect(logger.debug).toHaveBeenCalledWith(
        'Using unknown OpenAI realtime model: unknown-realtime-model',
      );
    });

    it('should successfully call API and handle response', async () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17');
      const result = await provider.directWebSocketRequest('Tell me a joke');

      expect(result.output).toBe('Hello, world!');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
      expect(result.cached).toBe(false);
    });

    it('should handle error in API call', async () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17');

      // Override the default mock for this test
      (MockWebSocket as any).mockImplementationOnce(() => {
        const ws = {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
          once: jest.fn((event: string, handler: Function) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('WebSocket connection error')), 0);
            }
          }),
        };
        return ws;
      });

      const result = await provider.callApi('Tell me a joke');
      expect(result.error).toContain('WebSocket connection error');
    });

    it('should handle WebSocket events correctly', async () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17');
      jest.spyOn(provider, 'getApiKey').mockImplementation().mockReturnValue('sk-test-key');

      // Override the default mock for this test
      (MockWebSocket as any).mockImplementationOnce(() => {
        const ws = {
          on: jest.fn((event, handler) => {
            if (event === 'open') {
              // Trigger open immediately
              handler();
            }
            if (event === 'message') {
              // Trigger messages in next tick to ensure open has completed
              process.nextTick(() => {
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.text.done',
                      text: 'Hello, world!',
                      usage: { total_tokens: 10, input_tokens: 5, output_tokens: 5 },
                    }),
                  ),
                );
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.done',
                      response: {
                        usage: { total_tokens: 10, input_tokens: 5, output_tokens: 5 },
                      },
                    }),
                  ),
                );
              });
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
          once: jest.fn(),
        };
        return ws;
      });

      const result = await provider.callApi('Hello');

      expect(result.output).toBe('Hello, world!');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    });

    it('should handle function calls correctly', async () => {
      const functionCallHandler = jest
        .fn()
        .mockResolvedValue('{"weather": "sunny", "temperature": 25}');

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get the weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            },
          ],
          functionCallHandler,
        },
      });

      // Override the default mock for this test
      (MockWebSocket as any).mockImplementationOnce(() => {
        const ws = {
          on: jest.fn((event, handler) => {
            if (event === 'open') {
              // Trigger open immediately
              handler();
            }
            if (event === 'message') {
              // Trigger messages in next tick to ensure open has completed
              process.nextTick(() => {
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.text.done',
                      text: 'The weather in New York is sunny, 25°C',
                      usage: { total_tokens: 15, prompt: 8, completion: 7 },
                      functionCallOccurred: true,
                      functionCallResults: ['{"weather": "sunny", "temperature": 25}'],
                    }),
                  ),
                );
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.done',
                      response: {
                        usage: { total_tokens: 15, prompt: 8, completion: 7 },
                        functionCallOccurred: true,
                        functionCallResults: ['{"weather": "sunny", "temperature": 25}'],
                      },
                    }),
                  ),
                );
              });
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
          once: jest.fn(),
        };
        return ws;
      });

      const result = await provider.callApi("What's the weather in New York?");
      const expected =
        'The weather in New York is sunny, 25°C\n\n[Function calls were made during processing]';
      expect(result.output).toBe(expected);
      expect(result.metadata).toHaveProperty('functionCallOccurred', true);
    });

    it('should handle audio data in response', async () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17');

      // Mock audio data (base64 encoded)
      const audioData = 'base64encodedaudiodata';

      // Override the default mock for this test
      (MockWebSocket as any).mockImplementationOnce(() => {
        const ws = {
          on: jest.fn((event, handler) => {
            if (event === 'open') {
              // Trigger open immediately
              handler();
            }
            if (event === 'message') {
              // Trigger messages in next tick to ensure open has completed
              process.nextTick(() => {
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.text.done',
                      text: 'This is the transcript of the audio',
                      usage: { total_tokens: 12, prompt: 5, completion: 7 },
                      audio: {
                        data: audioData,
                        format: 'pcm16',
                      },
                    }),
                  ),
                );
                handler(
                  Buffer.from(
                    JSON.stringify({
                      type: 'response.done',
                      response: {
                        usage: { total_tokens: 12, prompt: 5, completion: 7 },
                        audio: {
                          data: audioData,
                          format: 'pcm16',
                        },
                      },
                    }),
                  ),
                );
              });
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
          once: jest.fn(),
        };
        return ws;
      });

      const result = await provider.callApi('Generate audio response');

      expect(result.output).toBe('This is the transcript of the audio');
      expect(result.audio).toEqual({
        data: audioData,
        format: 'pcm16',
        transcript: 'This is the transcript of the audio',
      });
    });

    it('should throw error when API key is not set', async () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17');

      // Mock getApiKey to return undefined instead of null
      jest.spyOn(provider, 'getApiKey').mockImplementation().mockReturnValue(undefined);

      await expect(provider.callApi('Hello')).rejects.toThrow('OpenAI API key is not set');
    });

    it('should use correct session parameters', () => {
      const config = {
        modalities: ['text'],
        voice: 'echo' as const,
        instructions: 'Custom instructions',
        input_audio_format: 'pcm16' as const,
        output_audio_format: 'pcm16' as const,
        temperature: 0.9,
        max_response_output_tokens: 100,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17', { config });

      const body = provider.getRealtimeSessionBody();

      expect(body).toEqual({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        modalities: ['text'],
        voice: 'echo',
        instructions: 'Custom instructions',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        temperature: 0.9,
        max_response_output_tokens: 100,
      });
    });

    it('should set websocket timeout from config', () => {
      // Test a specific timeout value
      const timeoutValue = 12345;

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview-2024-12-17', {
        config: { websocketTimeout: timeoutValue },
      });

      // Verify the provider stored the config value correctly
      expect(provider.config.websocketTimeout).toBe(timeoutValue);
    });
  });
});
