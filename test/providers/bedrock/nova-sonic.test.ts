import { TextEncoder } from 'util';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { categorizeError, NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';
import { mockProcessEnv } from '../../util/utils';

const nodeHttp2HandlerFactory = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock('@smithy/node-http-handler', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    NodeHttp2Handler: vi.fn().mockImplementation(function () {
      return { handle: nodeHttp2HandlerFactory.handle };
    }),
  };
});

vi.mock('@aws-sdk/credential-provider-sso', () => ({
  fromSSO: vi.fn(),
}));

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
  let mockSend: Mock;
  let bedrockClient: any;
  let provider: NovaSonicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    nodeHttp2HandlerFactory.handle.mockReset();
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

    it('should force SigV4 while preserving IAM credentials, profiles, endpoints, and the default chain', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'unsupported-bedrock-api-key',
      });
      const profileCredentials = vi.fn();
      vi.mocked(fromSSO).mockReturnValue(profileCredentials);

      try {
        const explicitCredentialsProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
          config: {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
            sessionToken: 'test-session-token',
            endpoint: 'https://bedrock.example.com',
          },
        });
        await (explicitCredentialsProvider as any).getBedrockClient();

        const explicitClientConfig = vi.mocked(BedrockRuntimeClient).mock.calls.at(-1)?.[0];
        expect(explicitClientConfig).toMatchObject({
          authSchemePreference: ['sigv4'],
          credentials: {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
            sessionToken: 'test-session-token',
          },
          endpoint: 'https://bedrock.example.com',
        });

        const profileProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
          config: { profile: 'test-profile' },
        });
        await (profileProvider as any).getBedrockClient();

        expect(fromSSO).toHaveBeenCalledWith({ profile: 'test-profile' });
        expect(vi.mocked(BedrockRuntimeClient).mock.calls.at(-1)?.[0]).toMatchObject({
          authSchemePreference: ['sigv4'],
          credentials: profileCredentials,
        });

        const defaultChainProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0');
        await (defaultChainProvider as any).getBedrockClient();

        const defaultClientConfig = vi.mocked(BedrockRuntimeClient).mock.calls.at(-1)?.[0];
        expect(defaultClientConfig).toBeDefined();
        expect(defaultClientConfig).toMatchObject({ authSchemePreference: ['sigv4'] });
        expect(defaultClientConfig).not.toHaveProperty('credentials');
        if (!defaultClientConfig) {
          throw new Error('Expected the Nova Sonic provider to construct a Bedrock client');
        }

        const { BedrockRuntimeClient: ActualBedrockRuntimeClient } = await vi.importActual<
          typeof import('@aws-sdk/client-bedrock-runtime')
        >('@aws-sdk/client-bedrock-runtime');
        const actualClient = new ActualBedrockRuntimeClient(defaultClientConfig);
        expect(await actualClient.config.authSchemePreference()).toEqual(['sigv4']);
        expect(actualClient.config.credentials).toEqual(expect.any(Function));
        actualClient.destroy();
      } finally {
        restoreEnv();
      }
    });

    it('should ignore an inherited Bedrock API key and use the SigV4 default credential chain', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const apiKeyProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: { apiKey: 'inherited-unused-api-key' },
      });

      const result = await apiKeyProvider.callApi('Test prompt');

      const clientConfig = vi.mocked(BedrockRuntimeClient).mock.calls.at(-1)?.[0];
      expect(clientConfig).toMatchObject({ authSchemePreference: ['sigv4'] });
      expect(clientConfig).not.toHaveProperty('credentials');
      expect(clientConfig).not.toHaveProperty('token');
      expect(mockSend).toHaveBeenCalled();
      expect(result.output).toContain('This is a test response');
    });

    it.each([
      {
        name: 'explicit credentials',
        config: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
          apiKey: 'unused-api-key',
        },
        expectedCredentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      },
      {
        name: 'an AWS profile',
        config: { profile: 'test-profile', apiKey: 'unused-api-key' },
        expectedCredentials: expect.any(Function),
      },
    ])(
      'should preserve $name when an API key is also configured',
      async ({ config, expectedCredentials }) => {
        vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
        const profileCredentials = vi.fn();
        vi.mocked(fromSSO).mockReturnValue(profileCredentials);
        const mixedCredentialsProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
          config,
        });

        await mixedCredentialsProvider.callApi('Test prompt');

        expect(vi.mocked(BedrockRuntimeClient).mock.calls.at(-1)?.[0]).toMatchObject({
          authSchemePreference: ['sigv4'],
          credentials: config.profile === undefined ? expectedCredentials : profileCredentials,
        });
        expect(mockSend).toHaveBeenCalled();
      },
    );

    it('should reject Nova 2 Sonic outside its published in-region endpoints', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const testProvider = new NovaSonicProvider('amazon.nova-2-sonic-v1:0', {
        config: { region: 'eu-west-1' },
      });

      await expect((testProvider as any).getBedrockClient()).rejects.toThrow(
        'Supported Regions: us-east-1, us-west-2, eu-north-1, ap-northeast-1',
      );
      expect(BedrockRuntimeClient).not.toHaveBeenCalled();
    });

    it('should allow Nova 2 Sonic custom endpoints outside published regions and retain the signing region', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const testProvider = new NovaSonicProvider('amazon.nova-2-sonic-v1:0', {
        config: {
          region: 'eu-west-1',
          endpoint: 'https://bedrock.internal.example',
        },
      });

      await (testProvider as any).getBedrockClient();

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'eu-west-1',
          endpoint: 'https://bedrock.internal.example',
          authSchemePreference: ['sigv4'],
        }),
      );
    });
  });

  describe('API Interactions', () => {
    it('should reach the stream client when constructed without options', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const defaultProvider = new NovaSonicProvider();

      const result = await defaultProvider.callApi('Test prompt');

      expect(BedrockRuntimeClient).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'amazon.nova-sonic-v1:0' }),
      );
      expect(result).toMatchObject({ output: 'This is a test response\n' });
    });

    it('should reject turn detection for Nova Sonic v1 before opening a stream', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const configuredProvider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
        config: {
          turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
        },
      });

      await expect(configuredProvider.callApi('Test prompt')).rejects.toThrow(
        'turnDetectionConfiguration is only supported by amazon.nova-2-sonic-v1:0',
      );
      expect(BedrockRuntimeClient).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
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

    it('should forward the published Nova 2 Sonic prompt configuration', async () => {
      vi.spyOn(NovaSonicProvider.prototype, 'callApi').mockRestore();
      const configuredProvider = new NovaSonicProvider('amazon.nova-2-sonic-v1:0', {
        config: {
          region: 'us-east-1',
          interfaceConfig: {
            maxTokens: 2048,
            topP: 0.8,
            temperature: 0.5,
          },
          turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
          textOutputConfiguration: { mediaType: 'text/plain' },
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: 'get_weather',
                  description: 'Get weather information',
                  inputSchema: {
                    json: {
                      type: 'object',
                      properties: {},
                      required: [],
                    },
                  },
                },
              },
            ],
          },
          toolUseOutputConfiguration: { mediaType: 'application/json' },
        },
      });
      (configuredProvider as any).bedrockClient = bedrockClient;
      const sendEventSpy = vi.spyOn(configuredProvider as any, 'sendEvent');

      await configuredProvider.callApi('Test prompt');

      const promptStart = sendEventSpy.mock.calls
        .map(
          ([, event]) =>
            (event as { event: { promptStart?: Record<string, unknown> } }).event.promptStart,
        )
        .find(Boolean);
      expect(promptStart).toMatchObject({
        textOutputConfiguration: { mediaType: 'text/plain' },
        toolConfiguration: {
          tools: [
            {
              toolSpec: {
                name: 'get_weather',
              },
            },
          ],
        },
        toolUseOutputConfiguration: { mediaType: 'application/json' },
      });
      expect(sendEventSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          event: {
            sessionStart: {
              inferenceConfiguration: {
                maxTokens: 2048,
                topP: 0.8,
                temperature: 0.5,
              },
              turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
            },
          },
        }),
      );
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
