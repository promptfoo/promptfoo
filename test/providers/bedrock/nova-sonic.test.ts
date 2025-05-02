import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { TextEncoder } from 'util';
import { disableCache, enableCache } from '../../../src/cache';
import { NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';

/**
 * Nova Sonic Provider Tests
 *
 * These tests validate the functionality of the NovaSonicProvider for AWS Bedrock.
 * We use comprehensive mocking of timers and async operations to ensure fast test execution.
 */

// Mock all timers globally
jest.useFakeTimers();

// Mock external dependencies
jest.mock('node:timers', () => ({
  setTimeout: jest.fn((cb) => {
    cb();
    return 123;
  }),
}));

jest.mock('rxjs', () => {
  const originalModule = jest.requireActual('rxjs');
  return {
    ...originalModule,
    Subject: jest.fn().mockImplementation(() => ({
      next: jest.fn(),
      pipe: jest.fn(() => ({
        subscribe: jest.fn(),
      })),
    })),
    firstValueFrom: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttp2Handler: jest.fn(),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  InvokeModelWithBidirectionalStreamCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Test helpers for working with streaming responses
const encodeChunk = (obj: any) => ({
  chunk: { bytes: new TextEncoder().encode(JSON.stringify(obj)) },
});

function createMockStreamResponse(responseObjects: any[]) {
  const chunks = responseObjects.map(encodeChunk);
  let index = 0;

  return {
    body: {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (index < chunks.length) {
            return { done: false, value: chunks[index++] };
          }
          return { done: true, value: undefined };
        },
      }),
    },
  };
}

// Standard response fixtures
const standardTextResponse = [
  {
    event: {
      textOutput: {
        role: 'ASSISTANT',
        content: 'This is a test response',
      },
    },
  },
  {
    event: {
      contentEnd: {
        stopReason: 'END_TURN',
      },
    },
  },
];

const audioResponse = [
  {
    event: {
      textOutput: {
        role: 'ASSISTANT',
        content: 'This is an audio response',
      },
    },
  },
  {
    event: {
      audioOutput: {
        content: 'base64encodedaudiodata',
      },
    },
  },
  {
    event: {
      contentEnd: {
        stopReason: 'END_TURN',
      },
    },
  },
];

const functionCallResponse = [
  {
    event: {
      textOutput: {
        role: 'ASSISTANT',
        content: 'I will check the weather for you',
      },
    },
  },
  {
    event: {
      toolUse: {
        toolName: 'get_weather',
        toolUseId: 'tool-123',
        parameters: {
          location: 'New York',
        },
      },
    },
  },
  {
    event: {
      contentEnd: {
        stopReason: 'END_TURN',
      },
    },
  },
];

describe('NovaSonic Provider', () => {
  // Common test variables
  let mockSend: jest.Mock;
  let bedrockClient: any;
  let provider: NovaSonicProvider;

  beforeEach(() => {
    // Reset mocks and cache
    jest.clearAllMocks();
    disableCache();

    // Create standard mocks
    mockSend = jest.fn().mockResolvedValue(createMockStreamResponse(standardTextResponse));
    bedrockClient = { send: mockSend };

    // Update the BedrockRuntimeClient mock
    jest.mocked(BedrockRuntimeClient).mockImplementation(() => bedrockClient);

    // Create a provider instance for tests
    provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
    (provider as any).bedrockClient = bedrockClient;
  });

  afterEach(() => {
    // Clean up after tests
    enableCache();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
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

      const configuredProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', { config });

      // Assert on entire objects as recommended in guidelines
      expect({
        modelName: configuredProvider.modelName,
        config: configuredProvider.config,
      }).toEqual({
        modelName: 'amazon.nova-sonic-v1:0',
        config,
      });
    });

    it('should initialize with default model name if not provided', () => {
      const defaultProvider = new NovaSonicProvider();
      expect(defaultProvider.modelName).toBe('amazon.nova-sonic-v1:0');
    });

    it('should create the Bedrock client with the correct configuration', () => {
      // Create provider with specific region
      new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: { region: 'us-west-2' },
      });

      // Validate client configuration
      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-west-2',
          requestHandler: expect.any(Object),
        }),
      );

      // Validate handler configuration
      expect(NodeHttp2Handler).toHaveBeenCalledWith({
        requestTimeout: 300000,
        sessionTimeout: 300000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      });
    });
  });

  describe('API Interactions', () => {
    beforeEach(() => {
      // Setup common mocking for API tests
      jest.spyOn(provider as any, 'createAsyncIterable').mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
          }),
        };
      });
    });

    it('should successfully call API and handle text response', async () => {
      const result = await provider.callApi('Test prompt');

      // Verify API was called correctly
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'amazon.nova-sonic-v1:0',
        }),
      );

      // Assert on the entire result object
      expect(result).toEqual({
        output: 'This is a test response\n',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          functionCallOccurred: false,
        },
      });
    });

    it('should handle JSON array format prompts', async () => {
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

      // Verify API was called with correct model ID
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'amazon.nova-sonic-v1:0',
        }),
      );
    });

    it('should handle session management correctly', async () => {
      // Spy on internal methods
      const createSessionSpy = jest.spyOn(provider as any, 'createSession');
      const endSessionSpy = jest
        .spyOn(provider as any, 'endSession')
        .mockImplementation(() => Promise.resolve());

      await provider.callApi('Test prompt');

      // Verify session management methods were called correctly
      expect(createSessionSpy).toHaveBeenCalledWith(expect.any(String));
      expect(endSessionSpy).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('Response Handling', () => {
    beforeEach(() => {
      // Setup common mocking for response tests
      jest.spyOn(provider as any, 'createAsyncIterable').mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
          }),
        };
      });
    });

    it('should handle audio content in responses', async () => {
      // Setup audio response mock
      (provider as any).bedrockClient = {
        send: jest.fn().mockResolvedValue(createMockStreamResponse(audioResponse)),
      };

      const result = await provider.callApi('Generate audio');

      // Assert on the complete result structure
      expect(result).toEqual({
        output: 'This is an audio response\n',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          audio: {
            data: 'base64encodedaudiodata',
            format: 'lpcm',
            transcript: 'This is an audio response\n',
          },
          functionCallOccurred: false,
          userTranscript: '',
        },
      });
    });

    it('should handle function calls correctly', async () => {
      // Create provider with tool configuration
      const toolProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
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

      // Mock internal methods
      (toolProvider as any).bedrockClient = {
        send: jest.fn().mockResolvedValue(createMockStreamResponse(functionCallResponse)),
      };

      jest.spyOn(toolProvider as any, 'createAsyncIterable').mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
          }),
        };
      });

      const result = await toolProvider.callApi("What's the weather in New York?");

      // Assert on the complete result
      expect(result).toEqual({
        output: 'I will check the weather for you\n',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          functionCallOccurred: true,
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in API calls', async () => {
      const error = new Error('Bedrock API error');

      // Setup error-throwing client
      (provider as any).bedrockClient = {
        send: jest.fn().mockImplementation(() => {
          throw error;
        }),
      };

      const result = await provider.callApi('Test prompt');

      // Verify error was handled correctly
      expect(result).toEqual({
        error: 'Bedrock API error',
        metadata: {},
      });
    });
  });
});
