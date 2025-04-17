import WebSocket from 'ws';
import { disableCache, enableCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiRealtimeProvider } from '../../../src/providers/openai/realtime';
import type { OpenAiRealtimeOptions } from '../../../src/providers/openai/realtime';

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
  let mockWs: any;
  let mockHandlers: { [key: string]: Function[] };

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
    mockHandlers = {
      open: [],
      message: [],
      error: [],
      close: [],
    };

    // Create a mock WebSocket instance
    mockWs = {
      on: jest.fn((event: string, handler: Function) => {
        mockHandlers[event].push(handler);
      }),
      send: jest.fn(),
      close: jest.fn(),
      once: jest.fn((event: string, handler: Function) => {
        mockHandlers[event].push(handler);
      }),
    };

    // Mock WebSocket constructor
    (MockWebSocket as any).mockImplementation(() => mockWs);
  });

  afterEach(() => {
    enableCache();
  });

  describe('Basic Functionality', () => {
    it('should initialize with correct model and config', () => {
      const config = {
        modalities: ['text'],
        instructions: 'Test instructions',
        voice: 'alloy' as const,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      expect(provider.modelName).toBe('gpt-4o-realtime-preview');
      expect(provider.config).toEqual(expect.objectContaining(config));
      expect(provider.config.maintainContext).toBe(true); // Default value
    });

    it('should log warning for unknown model', () => {
      new OpenAiRealtimeProvider('unknown-model');
      expect(logger.debug).toHaveBeenCalledWith(
        'Using unknown OpenAI realtime model: unknown-model',
      );
    });

    it('should generate valid session body', () => {
      const config = {
        modalities: ['text'],
        voice: 'echo' as const,
        instructions: 'Test instructions',
        temperature: 0.7,
        max_response_output_tokens: 100,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });
      const body = provider.getRealtimeSessionBody();

      expect(body).toEqual({
        model: 'gpt-4o-realtime-preview',
        modalities: ['text'],
        voice: 'echo',
        instructions: 'Test instructions',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        temperature: 0.7,
        max_response_output_tokens: 100,
      });
    });

    it('should handle audio configuration', () => {
      const config: OpenAiRealtimeOptions = {
        modalities: ['text', 'audio'],
        voice: 'alloy' as const,
        instructions: 'Test instructions',
        input_audio_format: 'pcm16' as const,
        output_audio_format: 'pcm16' as const,
        input_audio_transcription: {
          model: 'whisper-1',
          language: 'en',
          prompt: 'Transcribe the following audio',
        },
        temperature: 0.8,
        max_response_output_tokens: 'inf' as const,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });
      const body = provider.getRealtimeSessionBody();

      expect(body).toEqual({
        model: 'gpt-4o-realtime-preview',
        modalities: ['text', 'audio'],
        voice: 'alloy',
        instructions: 'Test instructions',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
          language: 'en',
          prompt: 'Transcribe the following audio',
        },
        temperature: 0.8,
        max_response_output_tokens: 'inf',
      });
    });

    it('should handle basic text response with persistent connection', async () => {
      const config = {
        modalities: ['text'],
        instructions: 'Test instructions',
        maintainContext: true,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      // Create mock WebSocket connection
      provider.persistentConnection = {
        on: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        once: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeListener: jest.fn(),
      };

      // Create a promise for the API call
      const responsePromise = provider.callApi('Hello');

      // Get the message handler
      const messageHandlers = mockHandlers.message;
      const lastHandler = messageHandlers[messageHandlers.length - 1];

      // Simulate conversation item created
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'conversation.item.created',
            item: { id: 'msg_123', role: 'user' },
          }),
        ),
      );

      // Simulate response created
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.created',
            response: { id: 'resp_123' },
          }),
        ),
      );

      // Simulate text delta
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.delta',
            delta: 'Hello',
          }),
        ),
      );

      // Simulate text done
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.done',
            text: 'Hello',
          }),
        ),
      );

      // Simulate response done
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.done',
            response: {
              usage: {
                total_tokens: 10,
                prompt_tokens: 5,
                completion_tokens: 5,
              },
            },
          }),
        ),
      );

      const response = await responsePromise;

      // Verify the response
      expect(response.output).toBe('Hello');
      expect(response.metadata?.responseId).toBe('resp_123');
      expect(response.metadata?.messageId).toBe('msg_123');

      // Verify that the connection was not closed (persistent)
      expect(provider.persistentConnection?.close).not.toHaveBeenCalled();

      // Verify that the connection is maintained
      expect(provider.persistentConnection).not.toBeNull();
    });

    it('should maintain conversation context across multiple messages', async () => {
      const config = {
        modalities: ['text'],
        instructions: 'Test instructions',
        maintainContext: true,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      // Create mock WebSocket connection
      provider.persistentConnection = {
        on: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        once: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeListener: jest.fn(),
      };

      // Helper function to simulate message sequence
      const simulateMessageSequence = async (
        messageId: string,
        assistantId: string,
        responseId: string,
        responseText: string,
      ) => {
        const messageHandlers = mockHandlers.message;
        const lastHandler = messageHandlers[messageHandlers.length - 1];

        // User message
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'conversation.item.created',
                item: { id: messageId, role: 'user' },
              }),
            ),
          ),
        );

        // Assistant message
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'conversation.item.created',
                item: { id: assistantId, role: 'assistant' },
              }),
            ),
          ),
        );

        // Response created
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'response.created',
                response: { id: responseId },
              }),
            ),
          ),
        );

        // Text delta
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'response.text.delta',
                delta: responseText,
              }),
            ),
          ),
        );

        // Text done
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'response.text.done',
                text: responseText,
              }),
            ),
          ),
        );

        // Response done
        await Promise.resolve(
          lastHandler(
            Buffer.from(
              JSON.stringify({
                type: 'response.done',
                response: {
                  usage: {
                    total_tokens: responseText.length * 2,
                    prompt_tokens: responseText.length,
                    completion_tokens: responseText.length,
                  },
                },
              }),
            ),
          ),
        );
      };

      // First message
      const firstResponsePromise = provider.callApi('First message');
      await simulateMessageSequence('msg_1', 'assistant_1', 'resp_1', 'First response');
      const firstResponse = await firstResponsePromise;

      // Verify first response
      expect(firstResponse.output).toBe('First response');
      expect(provider.previousItemId).toBe('assistant_1');
      expect(provider.assistantMessageIds).toContain('assistant_1');

      // Second message
      const secondResponsePromise = provider.callApi('Second message');

      // Verify context maintenance
      expect(provider.persistentConnection.send).toHaveBeenCalledWith(
        expect.stringContaining('"previous_item_id":"assistant_1"'),
      );

      await simulateMessageSequence('msg_2', 'assistant_2', 'resp_2', 'Second response');
      const secondResponse = await secondResponsePromise;

      // Verify second response
      expect(secondResponse.output).toBe('Second response');
      expect(provider.previousItemId).toBe('assistant_2');
      expect(provider.assistantMessageIds).toContain('assistant_2');
      expect(provider.assistantMessageIds).toHaveLength(2);

      // Verify connection state
      expect(provider.persistentConnection?.close).not.toHaveBeenCalled();
      expect(provider.persistentConnection).not.toBeNull();
    });

    it('should handle WebSocket errors in persistent connection', async () => {
      const config = {
        modalities: ['text'],
        maintainContext: true,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      // Create mock WebSocket connection
      provider.persistentConnection = {
        on: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        once: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeListener: jest.fn(),
      };

      const responsePromise = provider.callApi('Hello');

      // Get the error handler and simulate a WebSocket error
      const errorHandlers = mockHandlers.error;
      const lastErrorHandler = errorHandlers[errorHandlers.length - 1];
      lastErrorHandler(new Error('Connection failed'));

      const response = await responsePromise;
      expect(response.error).toBe('WebSocket error: Error: Connection failed');
      expect(response.metadata).toEqual({});
      expect(provider.persistentConnection).toBeNull();
    });

    it('should handle audio response in persistent connection', async () => {
      const config = {
        modalities: ['text', 'audio'],
        maintainContext: true,
        voice: 'alloy' as const,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      // Create mock WebSocket connection
      provider.persistentConnection = {
        on: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        once: jest.fn((event: string, handler: Function) => {
          mockHandlers[event].push(handler);
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeListener: jest.fn(),
      };

      const responsePromise = provider.callApi('Hello');

      // Get the message handler
      const messageHandlers = mockHandlers.message;
      const lastHandler = messageHandlers[messageHandlers.length - 1];

      // Simulate conversation item created
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'conversation.item.created',
            item: { id: 'msg_1', role: 'user' },
          }),
        ),
      );

      // Simulate response created
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.created',
            response: { id: 'resp_1' },
          }),
        ),
      );

      // Simulate audio response
      const audioData = Buffer.from('fake_audio_data');
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.audio.delta',
            item_id: 'audio_1',
            audio: audioData.toString('base64'),
          }),
        ),
      );

      // Simulate audio done
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.audio.done',
            format: 'wav',
            item_id: 'audio_1',
          }),
        ),
      );

      // Simulate text response
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.delta',
            delta: 'Hello there',
          }),
        ),
      );

      // Simulate text done
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.done',
            text: 'Hello there',
          }),
        ),
      );

      // Simulate response done
      lastHandler(
        Buffer.from(
          JSON.stringify({
            type: 'response.done',
            response: {
              usage: {
                total_tokens: 10,
                prompt_tokens: 5,
                completion_tokens: 5,
              },
            },
          }),
        ),
      );

      const response = await responsePromise;

      // Verify text response
      expect(response.output).toBe('Hello there');

      // First verify audio exists
      expect(response.audio).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata!.audio).toBeDefined();

      // Then verify audio properties
      expect(response.audio!.format).toBe('wav');
      expect(response.audio!.data).toBe(audioData.toString('base64'));
      expect(response.audio!.transcript).toBe('Hello there');

      // Verify metadata
      expect(response.metadata!.audio!.format).toBe('wav');
      expect(response.metadata!.audio!.data).toBe(audioData.toString('base64'));
    });

    it('should reuse existing connection for subsequent requests', async () => {
      const config = {
        modalities: ['text'],
        maintainContext: true,
      };

      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', { config });

      let messageHandler: Function | null = null;
      let openHandler: Function | null = null;

      // Create mock WebSocket connection with proper event handling
      const mockWs = {
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'message') {
            messageHandler = handler;
          }
          mockHandlers[event].push(handler);
        }),
        once: jest.fn((event: string, handler: Function) => {
          if (event === 'open') {
            openHandler = handler;
          }
          mockHandlers[event].push(handler);
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeListener: jest.fn(),
      };

      // Mock WebSocket constructor to return our mockWs
      (MockWebSocket as any).mockImplementation(() => mockWs);

      // First request
      const firstResponsePromise = provider.callApi('First message');

      // Wait a tick for the WebSocket constructor to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Trigger the open event which will set up message handlers
      expect(openHandler).toBeDefined();
      openHandler!();

      // Wait another tick for message handlers to be set up
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Now we can safely use the message handler
      expect(messageHandler).toBeDefined();

      // Simulate first message sequence
      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'conversation.item.created',
            item: { id: 'msg_1', role: 'user' },
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.created',
            response: { id: 'resp_1' },
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.delta',
            delta: 'First response',
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.done',
            text: 'First response',
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.done',
            response: {
              usage: {
                total_tokens: 10,
                prompt_tokens: 5,
                completion_tokens: 5,
              },
            },
          }),
        ),
      );

      const firstResponse = await firstResponsePromise;
      expect(firstResponse.output).toBe('First response');

      // Store the initial send count
      const initialSendCount = mockWs.send.mock.calls.length;

      // Second request - should reuse connection
      const secondResponsePromise = provider.callApi('Second message');

      // Verify the connection was reused
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"conversation.item.create"'),
      );

      // Simulate second message sequence
      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'conversation.item.created',
            item: { id: 'msg_2', role: 'user' },
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.created',
            response: { id: 'resp_2' },
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.delta',
            delta: 'Second response',
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.text.done',
            text: 'Second response',
          }),
        ),
      );

      messageHandler!(
        Buffer.from(
          JSON.stringify({
            type: 'response.done',
            response: {
              usage: {
                total_tokens: 12,
                prompt_tokens: 6,
                completion_tokens: 6,
              },
            },
          }),
        ),
      );

      const secondResponse = await secondResponsePromise;
      expect(secondResponse.output).toBe('Second response');

      // Verify new messages were sent on the same connection
      expect(mockWs.send.mock.calls.length).toBeGreaterThan(initialSendCount);

      // Clean up
      provider.cleanup();
      expect(mockWs.close).toHaveBeenCalledWith();
      expect(provider.persistentConnection).toBeNull();
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Cleanup', () => {
    it('should properly clean up resources', () => {
      const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview');
      provider.persistentConnection = mockWs;

      provider.cleanup();

      expect(mockWs.close).toHaveBeenCalledWith();
      expect(provider.persistentConnection).toBeNull();
    });
  });
});
