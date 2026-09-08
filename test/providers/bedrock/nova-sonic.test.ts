import { TextEncoder } from 'util';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { categorizeError, NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';

vi.mock('@smithy/node-http-handler', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    NodeHttp2Handler: vi.fn(),
  };
});

vi.mock('@aws-sdk/client-bedrock-runtime', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    BedrockRuntimeClient: vi.fn().mockImplementation(function () {
      return {
        send: vi.fn(),
      };
    }),

    InvokeModelWithBidirectionalStreamCommand: vi.fn().mockImplementation(function (params) {
      return params;
    }),
  };
});

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('node:timers', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    setTimeout: vi.fn((callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 123;
    }),
  };
});

const encodeChunk = (obj: any) => ({
  chunk: { bytes: new TextEncoder().encode(JSON.stringify(obj)) },
});

function createMockStreamResponse(responseObjects: any[]) {
  return {
    body: (async function* () {
      for (const event of responseObjects) {
        yield encodeChunk(event);
      }
    })(),
  };
}

function captureSonicRequest(mockSend: Mock, responseObjects: any[] = standardTextResponse) {
  const events: any[] = [];
  mockSend.mockImplementation(async ({ body }) => {
    const input = body[Symbol.asyncIterator]();
    let audioContentName: string | undefined;
    while (true) {
      const { value, done } = await input.next();
      if (done) {
        throw new Error('Sonic request ended before audio input');
      }
      const event = JSON.parse(new TextDecoder().decode(value.chunk.bytes)).event;
      events.push(event);
      if (event.contentStart?.type === 'AUDIO') {
        audioContentName = event.contentStart.contentName;
      }
      if (audioContentName && event.contentEnd?.contentName === audioContentName) {
        break;
      }
    }
    return {
      body: (async function* () {
        for (const response of responseObjects) {
          yield encodeChunk(response);
          if ('toolUse' in response.event) {
            for (let i = 0; i < 3; i++) {
              const { value } = await input.next();
              events.push(JSON.parse(new TextDecoder().decode(value.chunk.bytes)).event);
            }
          }
        }
      })(),
    };
  });
  return events;
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
        content: JSON.stringify({ location: 'New York' }),
      },
    },
  },
  {
    event: {
      contentEnd: {
        type: 'TOOL',
        stopReason: 'TOOL_USE',
      },
    },
  },
  ...standardTextResponse,
];

describe('NovaSonic Provider', () => {
  let mockSend: Mock;
  let bedrockClient: any;
  let provider: NovaSonicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    disableCache();

    mockSend = vi.fn().mockResolvedValue(createMockStreamResponse(standardTextResponse));
    bedrockClient = { send: mockSend };

    vi.mocked(BedrockRuntimeClient).mockImplementation(function () {
      return bedrockClient;
    });

    vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockImplementation(async function (
      this: any,
      _prompt,
    ) {
      const sessionId = 'mocked-session-id';

      const session = this.createSession(sessionId);

      session.responseHandlers.set('textOutput', (_data: any) => {});

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

    vi.spyOn(NovaSonicProvider.prototype, 'endSession').mockImplementation(function (this: any) {
      return Promise.resolve();
    });

    provider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
    (provider as any).bedrockClient = bedrockClient;
  });

  afterEach(() => {
    enableCache();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

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
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const defaultProvider = new NovaSonicProvider();
      expect(defaultProvider.modelName).toBe('amazon.nova-sonic-v1:0');
    });

    it('should create the Bedrock client with the correct configuration', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const testProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: { region: 'us-west-2' },
      });

      // Trigger lazy loading of the client by calling getBedrockClient
      await (testProvider as any).getBedrockClient();

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
    it('counts the request when a successful stream does not report token usage', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const result = await provider.callApi('Test prompt');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.tokenUsage).toMatchObject({ total: 0, numRequests: 1 });
    });

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
      const createSessionSpy = vi.spyOn(provider as any, 'createSession');
      const testPrompt = 'Test prompt';

      await provider.callApi(testPrompt);

      expect(createSessionSpy).toHaveBeenCalledWith('mocked-session-id');
    });

    it.each([
      [
        'documented configuration',
        { inferenceConfiguration: { maxTokens: 2048, temperature: 0.4, topP: 0.8 } },
        { maxTokens: 2048, temperature: 0.4, topP: 0.8 },
      ],
      [
        'short alias',
        { inferenceConfig: { maxTokens: 2048, temperature: 0.4, topP: 0.8 } },
        { maxTokens: 2048, temperature: 0.4, topP: 0.8 },
      ],
      [
        'legacy snake case',
        { interfaceConfig: { max_new_tokens: 2048, temperature: 0.4, top_p: 0.8 } },
        { maxTokens: 2048, temperature: 0.4, topP: 0.8 },
      ],
      [
        'legacy camel case',
        { interfaceConfig: { maxTokens: 2048, temperature: 0.4, topP: 0.8 } },
        { maxTokens: 2048, temperature: 0.4, topP: 0.8 },
      ],
      [
        'documented spelling precedence',
        {
          inferenceConfiguration: { temperature: 0 },
          inferenceConfig: { temperature: 0.2 },
          interfaceConfig: { temperature: 0.3 },
        },
        { maxTokens: 1024, temperature: 0, topP: 0.9 },
      ],
      [
        'short alias precedence',
        { inferenceConfig: { temperature: 0 }, interfaceConfig: { temperature: 0.3 } },
        { maxTokens: 1024, temperature: 0, topP: 0.9 },
      ],
      [
        'partial legacy configuration',
        { interfaceConfig: { top_p: 0 } },
        { maxTokens: 1024, temperature: 0.7, topP: 0 },
      ],
      ['defaults', {}, { maxTokens: 1024, temperature: 0.7, topP: 0.9 }],
    ])('encodes %s in the session request', async (_label, config, expected) => {
      vi.useFakeTimers();
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const events = captureSonicRequest(mockSend);
      const configuredProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', { config });

      const request = configuredProvider.callApi('AA==');
      await vi.runAllTimersAsync();
      const result = await request;

      expect(events[0]).toEqual({ sessionStart: { inferenceConfiguration: expected } });
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('This is a test response\n');
    });
  });

  describe('Response Handling', () => {
    it('should handle audio content in responses', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      vi.spyOn(provider, 'callApi').mockResolvedValue({
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
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

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

      vi.spyOn(toolProvider, 'callApi').mockResolvedValue({
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

    it('sends an explicit tool error with matching stream event identifiers', async () => {
      vi.useFakeTimers();
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const events = captureSonicRequest(mockSend, functionCallResponse);

      const request = provider.callApi('AA==');
      await vi.runAllTimersAsync();
      const result = await request;
      const toolStartIndex = events.findIndex((event) => event.contentStart?.type === 'TOOL');
      const [start, toolResult, end] = events.slice(toolStartIndex, toolStartIndex + 3);

      expect(start.contentStart).toMatchObject({
        role: 'TOOL',
        toolResultInputConfiguration: { toolUseId: 'tool-123', type: 'TEXT' },
      });
      expect(toolResult.toolResult).toEqual({
        promptName: start.contentStart.promptName,
        contentName: start.contentStart.contentName,
        content: JSON.stringify({
          error: 'Tool use is not supported by the Nova Sonic provider.',
          toolName: 'get_weather',
          toolUseId: 'tool-123',
        }),
      });
      expect(end.contentEnd).toEqual({
        promptName: start.contentStart.promptName,
        contentName: start.contentStart.contentName,
      });
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('This is a test response');
      expect(result.metadata?.functionCallOccurred).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in API calls', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      vi.spyOn(provider, 'callApi').mockRejectedValue(new Error('Bedrock API error'));

      await expect(provider.callApi('Test prompt')).rejects.toThrow('Bedrock API error');
    });

    it('should handle network errors properly', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      vi.spyOn(provider, 'callApi').mockResolvedValue({
        error: 'Network error',
        metadata: {},
      });

      const result = await provider.callApi('Test with network error');

      expect(result.error).toBe('Network error');
      expect(result.metadata).toEqual({});
    });
  });

  describe('Custom Timeout Configuration', () => {
    it('should use custom sessionTimeout and requestTimeout values', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const customProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: {
          region: 'us-east-1',
          sessionTimeout: 600000,
          requestTimeout: 180000,
        },
      });

      await (customProvider as any).getBedrockClient();

      expect(NodeHttp2Handler).toHaveBeenCalledWith({
        requestTimeout: 180000,
        sessionTimeout: 600000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      });
    });

    it('should use default timeouts when not specified', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();

      const defaultProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: { region: 'us-east-1' },
      });

      await (defaultProvider as any).getBedrockClient();

      expect(NodeHttp2Handler).toHaveBeenCalledWith({
        requestTimeout: 300000,
        sessionTimeout: 300000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      });
    });
  });
});

describe('categorizeError', () => {
  it('should categorize connection errors (ECONNREFUSED)', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
    const result = categorizeError(error);

    expect(result.type).toBe('connection');
    expect(result.message).toBe(
      'Failed to connect to AWS Bedrock. Check your network and AWS configuration.',
    );
    expect(result.originalError).toBe(error);
  });

  it('should categorize connection errors (ENOTFOUND)', () => {
    const error = new Error('getaddrinfo ENOTFOUND bedrock.us-east-1.amazonaws.com');
    const result = categorizeError(error);

    expect(result.type).toBe('connection');
    expect(result.message).toBe(
      'Failed to connect to AWS Bedrock. Check your network and AWS configuration.',
    );
  });

  it('should categorize timeout errors', () => {
    const error = new Error('Request timeout after 30000ms');
    const result = categorizeError(error);

    expect(result.type).toBe('timeout');
    expect(result.message).toBe('Request timed out. The operation took too long to complete.');
  });

  it('should categorize timed out errors', () => {
    const error = new Error('Connection timed out');
    const result = categorizeError(error);

    expect(result.type).toBe('timeout');
  });

  it('should categorize aborted errors as timeout', () => {
    const error = new Error('Request aborted');
    const result = categorizeError(error);

    expect(result.type).toBe('timeout');
  });

  it('should categorize session errors', () => {
    const error = new Error('Session not found');
    const result = categorizeError(error);

    expect(result.type).toBe('session');
    expect(result.message).toBe(
      'Session error. The bidirectional stream session may have been invalidated.',
    );
  });

  it('should categorize parsing errors (JSON)', () => {
    const error = new Error('Unexpected token in JSON at position 0');
    const result = categorizeError(error);

    expect(result.type).toBe('parsing');
    expect(result.message).toBe(
      'Failed to parse response from Bedrock. The response format was unexpected.',
    );
  });

  it('should categorize parsing errors (parse)', () => {
    const error = new Error('Failed to parse response');
    const result = categorizeError(error);

    expect(result.type).toBe('parsing');
  });

  it('should categorize API/auth errors (access)', () => {
    const error = new Error('Access denied to bedrock:InvokeModel');
    const result = categorizeError(error);

    expect(result.type).toBe('api');
    expect(result.message).toBe(
      'AWS authentication error. Check your credentials and permissions.',
    );
  });

  it('should categorize API/auth errors (credential)', () => {
    const error = new Error('Invalid credential provided');
    const result = categorizeError(error);

    expect(result.type).toBe('api');
  });

  it('should categorize API/auth errors (auth)', () => {
    const error = new Error('Authentication failed');
    const result = categorizeError(error);

    expect(result.type).toBe('api');
  });

  it('should return unknown for unrecognized errors', () => {
    const error = new Error('Some random error occurred in the system');
    const result = categorizeError(error);

    expect(result.type).toBe('unknown');
    expect(result.message).toBe('Some random error occurred in the system');
    expect(result.originalError).toBe(error);
  });

  it('should handle non-Error objects', () => {
    const result = categorizeError('string error');

    expect(result.type).toBe('unknown');
    expect(result.message).toBe('string error');
  });

  it('should handle null/undefined', () => {
    const result = categorizeError(null);

    expect(result.type).toBe('unknown');
    expect(result.message).toBe('null');
  });
});
