import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { TextEncoder } from 'util';
import { disableCache, enableCache } from '../../../src/cache';
import { NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';

// Helper to create mock async iterables
function mockAsyncIterable(items: any[]) {
  return {
    [Symbol.asyncIterator]: () => {
      const iterator = items[Symbol.iterator]();
      return {
        next: async () => iterator.next(),
      };
    },
  };
}

// Standard mock event data for testing
const mockSuccessEventData = [
  {
    chunk: {
      bytes: new TextEncoder().encode(
        JSON.stringify({
          event: {
            textOutput: {
              role: 'ASSISTANT',
              content: 'This is a test response',
            },
          },
        }),
      ),
    },
  },
  {
    chunk: {
      bytes: new TextEncoder().encode(
        JSON.stringify({
          event: {
            contentEnd: {
              stopReason: 'END_TURN',
            },
          },
        }),
      ),
    },
  },
];

// Mock AWS SDK (just mock the constructor)
jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: jest.fn(),
    InvokeModelWithBidirectionalStreamCommand: jest.fn().mockImplementation((params) => params),
  };
});

// Mock NodeHttp2Handler
jest.mock('@smithy/node-http-handler', () => ({
  NodeHttp2Handler: jest.fn(),
}));

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

describe('NovaSonic Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('NovaSonicProvider', () => {
    it('should initialize with correct model and config', () => {
      const config = {
        inference: {
          maxTokens: 2048,
          topP: 0.8,
          temperature: 0.5,
        },
        audio: {
          output: {
            voiceId: 'alloy',
          },
        },
      };

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', { config });

      expect(provider.modelName).toBe('amazon.nova-sonic-v1:0');
      expect(provider.config).toEqual(config);
    });

    it('should initialize with default model name if not provided', () => {
      const provider = new NovaSonicProvider();
      expect(provider.modelName).toBe('amazon.nova-sonic-v1:0');
    });

    it('should create the Bedrock client with the correct configuration', () => {
      const _provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: { region: 'us-west-2' },
      });

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-west-2',
          requestHandler: expect.any(Object),
        }),
      );
      expect(NodeHttp2Handler).toHaveBeenCalledWith({
        requestTimeout: 300000,
        sessionTimeout: 300000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      });
    });

    it('should successfully call API and handle text response', async () => {
      // Create a mock send function that returns the expected response
      const mockSend = jest.fn().mockResolvedValue({
        body: mockAsyncIterable(mockSuccessEventData),
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
      // Directly patch the bedrockClient with our mock
      (provider as any).bedrockClient = { send: mockSend };

      const result = await provider.callApi('Tell me a joke');

      // Check that the send method was called with the correct command
      expect(mockSend).toHaveBeenCalledWith(expect.any(InvokeModelWithBidirectionalStreamCommand));

      // Verify the response
      expect(result.output).toBe('This is a test response\n');
      expect(result.tokenUsage).toEqual({ total: 0, prompt: 0, completion: 0 });
      expect(result.cached).toBe(false);
    });

    it('should handle error in API call', async () => {
      // Skip the failing test while we investigate further
      const error = new Error('Bedrock API error');
      // Create a mock that throws the error
      const mockSendWithError = jest.fn().mockImplementation(() => {
        throw error;
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
      // Directly patch the bedrockClient with our error mock
      (provider as any).bedrockClient = { send: mockSendWithError };

      const result = await provider.callApi('Tell me a joke');
      expect(result.error).toBe('Bedrock API error');
    });

    it('should handle audio content in response', async () => {
      // Mock implementation that returns audio content
      const audioMockSend = jest.fn().mockResolvedValue({
        body: mockAsyncIterable([
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    textOutput: {
                      role: 'ASSISTANT',
                      content: 'This is an audio response',
                    },
                  },
                }),
              ),
            },
          },
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    audioOutput: {
                      content: 'base64encodedaudiodata',
                    },
                  },
                }),
              ),
            },
          },
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    contentEnd: {
                      stopReason: 'END_TURN',
                    },
                  },
                }),
              ),
            },
          },
        ]),
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
      // Directly patch the bedrockClient with our audio mock
      (provider as any).bedrockClient = { send: audioMockSend };

      const result = await provider.callApi('Generate audio response');

      expect(result.output).toBe('This is an audio response\n');
      expect(result.metadata?.audio).toEqual({
        data: 'base64encodedaudiodata',
        format: 'lpcm',
        transcript: 'This is an audio response\n',
      });
    });

    it('should handle function calls correctly', async () => {
      // Mock implementation that returns a tool use event
      const toolUseMockSend = jest.fn().mockResolvedValue({
        body: mockAsyncIterable([
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    textOutput: {
                      role: 'ASSISTANT',
                      content: 'I will check the weather for you',
                    },
                  },
                }),
              ),
            },
          },
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    toolUse: {
                      toolName: 'get_weather',
                      toolUseId: 'tool-123',
                      parameters: {
                        location: 'New York',
                      },
                    },
                  },
                }),
              ),
            },
          },
          {
            chunk: {
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  event: {
                    contentEnd: {
                      stopReason: 'END_TURN',
                    },
                  },
                }),
              ),
            },
          },
        ]),
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: {
          toolConfig: {
            tools: [
              {
                name: 'get_weather',
                description: 'Get weather information',
                schema: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            ],
          },
        },
      });

      // Directly patch the bedrockClient with our tool use mock
      (provider as any).bedrockClient = { send: toolUseMockSend };

      const result = await provider.callApi("What's the weather in New York?");

      expect(result.output).toBe('I will check the weather for you\n');
      expect(result.metadata?.functionCallOccurred).toBe(true);
    });

    it('should handle JSON array format prompts', async () => {
      // Create a mock send function
      const jsonMockSend = jest.fn().mockResolvedValue({
        body: mockAsyncIterable(mockSuccessEventData),
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');

      // Directly patch the bedrockClient with our mock
      (provider as any).bedrockClient = { send: jsonMockSend };

      // Create a conversation in the OpenAI format
      const conversationHistory = JSON.stringify([
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are a helpful assistant.' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, who are you?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'm an AI assistant. How can I help you today?" }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Tell me a joke' }],
        },
      ]);

      await provider.callApi(conversationHistory);

      // The test mainly verifies that it doesn't crash when parsing JSON
      expect(jsonMockSend).toHaveBeenCalledWith(
        expect.any(InvokeModelWithBidirectionalStreamCommand),
      );
    });

    it('should handle session management correctly', async () => {
      // Create a mock send function
      const sessionMockSend = jest.fn().mockResolvedValue({
        body: mockAsyncIterable(mockSuccessEventData),
      });

      const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');

      // Override the internal createSession method to help with testing
      const originalCreateSession = (provider as any).createSession;
      const createSessionSpy = jest.fn(originalCreateSession);
      (provider as any).createSession = createSessionSpy;

      // Override the internal endSession method
      const originalEndSession = (provider as any).endSession;
      const endSessionSpy = jest.fn(originalEndSession);
      (provider as any).endSession = endSessionSpy;

      // Directly patch the bedrockClient with our mock
      (provider as any).bedrockClient = { send: sessionMockSend };

      await provider.callApi('Test prompt');

      // Check that the methods were called with expected args
      expect(createSessionSpy).toHaveBeenCalledWith(expect.any(String));
      expect(endSessionSpy).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
