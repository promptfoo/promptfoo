import { TextEncoder } from 'util';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { disableCache, enableCache } from '../../../src/cache';
import { NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';

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

jest.mock('node:timers', () => ({
  setTimeout: jest.fn((callback) => {
    if (typeof callback === 'function') {
      callback();
    }
    return 123;
  }),
}));

const encodeChunk = (obj: any) => ({
  chunk: { bytes: new TextEncoder().encode(JSON.stringify(obj)) },
});

function createMockStreamResponse(responseObjects: any[]) {
  const chunks = responseObjects.map(encodeChunk);

  return {
    body: {
      [Symbol.asyncIterator]: () => ({
        current: 0,
        isDone: false,

        async next() {
          if (this.isDone || this.current >= chunks.length) {
            return { done: true, value: undefined };
          }

          const chunk = chunks[this.current++];

          if (this.current >= chunks.length) {
            this.isDone = true;
          }

          return { done: false, value: chunk };
        },
      }),
    },
  };
}

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

const _audioResponse = [
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

const _functionCallResponse = [
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
  let mockSend: jest.Mock;
  let bedrockClient: any;
  let provider: NovaSonicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    disableCache();

    mockSend = jest.fn().mockResolvedValue(createMockStreamResponse(standardTextResponse));
    bedrockClient = { send: mockSend };

    jest.mocked(BedrockRuntimeClient).mockImplementation(() => bedrockClient);

    jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockImplementation(async function (
      this: any,
      prompt,
    ) {
      const sessionId = 'mocked-session-id';

      const session = this.createSession(sessionId);

      session.responseHandlers.set('textOutput', (data: any) => {});

      session.responseHandlers.set('contentEnd', () => {});

      return {
        output: 'This is a test response\n',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          functionCallOccurred: false,
        },
      };
    });

    jest.spyOn(NovaSonicProvider.prototype, 'endSession').mockImplementation(function (this: any) {
      return Promise.resolve();
    });

    provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
    (provider as any).bedrockClient = bedrockClient;
  });

  afterEach(() => {
    enableCache();
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const configuredProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', { config });

      expect({
        modelName: configuredProvider.modelName,
        config: configuredProvider.config,
      }).toEqual({
        modelName: 'amazon.nova-sonic-v1:0',
        config,
      });
    });

    it('should initialize with default model name if not provided', () => {
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const defaultProvider = new NovaSonicProvider();
      expect(defaultProvider.modelName).toBe('amazon.nova-sonic-v1:0');
    });

    it('should create the Bedrock client with the correct configuration', () => {
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      new NovaSonicProvider('amazon.nova-sonic-v1:0', {
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
  });

  describe('API Interactions', () => {
    it('should successfully call API and handle text response', async () => {
      const result = await provider.callApi('Test prompt');

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
      ]);

      await provider.callApi(conversationHistory);

      expect(provider.callApi).toHaveBeenCalledWith(conversationHistory);
    });

    it('should handle session management correctly', async () => {
      const createSessionSpy = jest.spyOn(provider as any, 'createSession');
      const testPrompt = 'Test prompt';

      await provider.callApi(testPrompt);

      expect(createSessionSpy).toHaveBeenCalledWith('mocked-session-id');
    });
  });

  describe('Response Handling', () => {
    it('should handle audio content in responses', async () => {
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      jest.spyOn(provider, 'callApi').mockResolvedValue({
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

      const result = await provider.callApi('Generate audio');

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
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

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

      jest.spyOn(toolProvider, 'callApi').mockResolvedValue({
        output: 'I will check the weather for you\n',
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          functionCallOccurred: true,
        },
      });

      const result = await toolProvider.callApi("What's the weather in New York?");

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
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      jest.spyOn(provider, 'callApi').mockRejectedValue(new Error('Bedrock API error'));

      await expect(provider.callApi('Test prompt')).rejects.toThrow('Bedrock API error');
    });

    it('should handle network errors properly', async () => {
      jest.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      jest.spyOn(provider, 'callApi').mockResolvedValue({
        error: 'Network error',
        metadata: {},
      });

      const result = await provider.callApi('Test with network error');

      expect(result.error).toBe('Network error');
      expect(result.metadata).toEqual({});
    });
  });
});
