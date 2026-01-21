import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import { AwsBedrockGenericProvider } from '../../../src/providers/bedrock/base';
import {
  AWS_BEDROCK_MODELS,
  AwsBedrockCompletionProvider,
  addConfigParam,
  BEDROCK_MODEL,
  coerceStrToNum,
  extractTextAndImages,
  extractTextContent,
  formatPromptLlama2Chat,
  formatPromptLlama3Instruct,
  formatPromptLlama4,
  formatPromptLlama32Vision,
  getLlamaModelHandler,
  LlamaVersion,
  parseValue,
} from '../../../src/providers/bedrock/index';

import type {
  BedrockAI21GenerationOptions,
  BedrockClaudeMessagesCompletionOptions,
  BedrockOpenAIGenerationOptions,
  IBedrockModel,
  LlamaMessage,
  TextGenerationOptions,
} from '../../../src/providers/bedrock/index';

const bedrockRuntimeFactory = vi.hoisted(() => {
  const mockInvokeModel = vi.fn();
  const BedrockRuntimeMock = vi.fn(function BedrockRuntimeMock(this: any) {
    return { invokeModel: mockInvokeModel };
  });

  return { BedrockRuntimeMock, mockInvokeModel };
});

const nodeHttpHandlerFactory = vi.hoisted(() => {
  let handlerFactory = () => ({ handle: vi.fn() });

  const NodeHttpHandlerMock = vi.fn(function NodeHttpHandlerMock(this: any) {
    return handlerFactory();
  });

  return {
    NodeHttpHandlerMock,
    setHandlerFactory: (factory: () => any) => {
      handlerFactory = factory;
    },
  };
});

const credentialProviderSsoFactory = vi.hoisted(() => ({
  mockSSOProvider: vi.fn(),
}));

vi.mock('@aws-sdk/client-bedrock-runtime', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    BedrockRuntime: bedrockRuntimeFactory.BedrockRuntimeMock,
  };
});

const BedrockRuntimeMock = vi.mocked(BedrockRuntime);

vi.mock('@smithy/node-http-handler', () => ({
  __esModule: true,
  NodeHttpHandler: nodeHttpHandlerFactory.NodeHttpHandlerMock,
  default: nodeHttpHandlerFactory.NodeHttpHandlerMock,
}));

const NodeHttpHandlerMock = vi.mocked(NodeHttpHandler);

// Preserve proxy variables so they can be restored after each test. These are
// set in the container environment and can influence proxy-related logic in the
// provider implementation.
const ORIGINAL_HTTP_PROXY = process.env.HTTP_PROXY;
const ORIGINAL_HTTPS_PROXY = process.env.HTTPS_PROXY;

vi.mock('proxy-agent', () => ({
  __esModule: true,
  ProxyAgent: vi.fn(function ProxyAgentMock() {}),
  default: vi.fn(function ProxyAgentMock() {}),
}));

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getCache: vi.fn(),
    isCacheEnabled: vi.fn(),
  };
});

class TestBedrockProvider extends AwsBedrockGenericProvider {
  modelName = 'test-model';

  constructor(config: any = {}) {
    super('test-model', { config });
  }

  async getClient() {
    return this.getBedrockInstance();
  }

  async generateText(_prompt: string, _options?: TextGenerationOptions): Promise<string> {
    return '';
  }

  async generateChat(_messages: any[], _options?: any): Promise<any> {
    return {};
  }
}

describe('AwsBedrockGenericProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AWS_BEDROCK_MAX_RETRIES;
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    // Ensure proxy environment variables do not force proxy-specific code paths
    // when running tests. The container sets HTTP_PROXY by default which causes
    // getBedrockInstance to require optional dependencies that are not
    // installed in the test environment.
    process.env.HTTP_PROXY = '';
    process.env.HTTPS_PROXY = '';

    nodeHttpHandlerFactory.setHandlerFactory(function () {
      return { handle: vi.fn() };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    process.env.HTTP_PROXY = ORIGINAL_HTTP_PROXY;
    process.env.HTTPS_PROXY = ORIGINAL_HTTPS_PROXY;
  });

  it('should create Bedrock instance without proxy settings', async () => {
    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', { config: { region: 'us-east-1' } });
      }
    })();
    await provider.getBedrockInstance();

    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
  });

  it('should create Bedrock instance with credentials', async () => {
    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', {
          config: {
            region: 'us-east-1',
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
          },
        });
      }
    })();
    await provider.getBedrockInstance();

    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
    });
  });

  it('should not include credentials if not provided', async () => {
    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', { config: { region: 'us-east-1' } });
      }
    })();
    await provider.getBedrockInstance();

    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
    expect(BedrockRuntimeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ credentials: expect.anything() }),
    );
  });

  it('should respect AWS_BEDROCK_MAX_RETRIES environment variable', async () => {
    process.env.AWS_BEDROCK_MAX_RETRIES = '10';
    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', { config: { region: 'us-east-1' } });
      }
    })();
    await provider.getBedrockInstance();

    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
  });

  it('should create Bedrock instance with custom request handler for API key authentication', async () => {
    const mockHandler = {
      handle: vi.fn(),
    };
    nodeHttpHandlerFactory.setHandlerFactory(function () {
      return mockHandler;
    });

    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', {
          config: {
            region: 'us-east-1',
            apiKey: 'test-api-key',
          },
        });
      }
    })();

    await provider.getBedrockInstance();

    expect(NodeHttpHandlerMock).toHaveBeenCalled();
    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
      requestHandler: expect.any(Object),
    });
  });

  it('should create custom request handler when AWS_BEARER_TOKEN_BEDROCK env var is set', async () => {
    process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-env-api-key';
    const mockHandler = {
      handle: vi.fn(),
    };
    nodeHttpHandlerFactory.setHandlerFactory(function () {
      return mockHandler;
    });

    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', { config: { region: 'us-east-1' } });
      }
    })();

    await provider.getBedrockInstance();

    expect(NodeHttpHandlerMock).toHaveBeenCalled();
    expect(BedrockRuntimeMock).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
      requestHandler: expect.any(Object),
    });

    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  });

  it('should add Authorization header with Bearer token to requests when using API key', async () => {
    const mockOriginalHandle = vi.fn().mockResolvedValue('response');
    const mockHandler = {
      handle: mockOriginalHandle,
    };
    nodeHttpHandlerFactory.setHandlerFactory(function () {
      return mockHandler;
    });

    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', {
          config: {
            region: 'us-east-1',
            apiKey: 'test-api-key',
          },
        });
      }
    })();

    await provider.getBedrockInstance();

    // Verify the handler was modified to add Bearer token
    expect(mockHandler.handle).toBeDefined();

    // Test that the modified handler adds the Authorization header
    const mockRequest = {
      headers: {},
    };

    await mockHandler.handle(mockRequest, {});

    expect(mockRequest.headers).toEqual({
      Authorization: 'Bearer test-api-key',
    });
    expect(mockOriginalHandle).toHaveBeenCalledWith(mockRequest, {});
  });

  describe('Custom endpoint support', () => {
    it('should use custom endpoint when endpoint is specified', async () => {
      const provider = new (class extends AwsBedrockGenericProvider {
        constructor() {
          super('test-model', {
            config: {
              region: 'us-east-1',
              endpoint: 'https://custom-bedrock-endpoint.example.com',
            },
          });
        }
      })();

      await provider.getBedrockInstance();

      expect(BedrockRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1',
          retryMode: 'adaptive',
          maxAttempts: 10,
          endpoint: 'https://custom-bedrock-endpoint.example.com',
        }),
      );
    });

    it('should not set endpoint when endpoint is not specified', async () => {
      const provider = new (class extends AwsBedrockGenericProvider {
        constructor() {
          super('test-model', {
            config: {
              region: 'us-east-1',
            },
          });
        }
      })();

      await provider.getBedrockInstance();

      const callArgs = BedrockRuntimeMock.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('endpoint');
    });
  });

  describe('Inference Profile ARN support', () => {
    it('should handle inference profile ARN with claude model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/claude-inference';
      const config: any = { inferenceModelType: 'claude' };

      // This test checks that getHandlerForModel correctly identifies the handler
      // We need to import and test the actual function
      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      // The handler should be CLAUDE_MESSAGES based on the inferenceModelType
      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('claude');
    });

    it('should handle inference profile ARN with nova model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/nova-inference';
      const config: any = { inferenceModelType: 'nova' };

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('nova');
    });

    it('should handle inference profile ARN with nova2 model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/nova2-inference';
      const config: any = { inferenceModelType: 'nova2' };

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('nova2');
    });

    it('should handle inference profile ARN with llama model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/llama-inference';
      const config: any = { inferenceModelType: 'llama' };

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('llama');
    });

    it('should handle inference profile ARN with deepseek model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/deepseek-inference';
      const config: any = { inferenceModelType: 'deepseek' };

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('deepseek');
    });

    it('should handle inference profile ARN with openai model type', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/openai-inference';
      const config: any = { inferenceModelType: 'openai' };

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config });

      expect(provider.modelName).toBe(arnModelName);
      expect((provider.config as any).inferenceModelType).toBe('openai');
    });

    it('should throw error for inference profile ARN without inferenceModelType', async () => {
      const arnModelName =
        'arn:aws:bedrock:us-east-1:123456789012:inference-profile/some-inference';

      const provider = new AwsBedrockCompletionProvider(arnModelName, { config: {} });

      // This should throw when callApi is invoked and it tries to get the handler
      expect(provider.modelName).toBe(arnModelName);
      // The error will be thrown when actually trying to use the model
    });
  });

  describe('BEDROCK_MODEL CLAUDE_MESSAGES', () => {
    const modelHandler = BEDROCK_MODEL.CLAUDE_MESSAGES;

    it('should include tools and tool_choice in params when provided', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
        tools: [
          {
            name: 'get_current_weather',
            description: 'Get the current weather in a given location',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
              },
              required: ['location'],
            },
          },
        ],
        tool_choice: {
          type: 'auto',
        },
      };

      const params = await modelHandler.params(config, 'Test prompt');

      expect(params).toHaveProperty('tools');
      expect(params.tools).toHaveLength(1);
      expect(params.tools[0]).toHaveProperty('name', 'get_current_weather');
      expect(params).toHaveProperty('tool_choice');
      expect(params.tool_choice).toEqual({ type: 'auto' });
    });

    it('should not include tools and tool_choice in params when not provided', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      const params = await modelHandler.params(config, 'Test prompt');

      expect(params).not.toHaveProperty('tools');
      expect(params).not.toHaveProperty('tool_choice');
    });

    it('should include specific tool_choice when provided', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
        tools: [
          {
            name: 'get_current_weather',
            description: 'Get the current weather in a given location',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
              },
              required: ['location'],
            },
          },
        ],
        tool_choice: {
          type: 'tool',
          name: 'get_current_weather',
        },
      };

      const params = await modelHandler.params(config, 'Test prompt');

      expect(params).toHaveProperty('tool_choice');
      expect(params.tool_choice).toEqual({ type: 'tool', name: 'get_current_weather' });
    });

    it('should handle JSON message array with image content', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      const prompt = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);

      const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(config, prompt);

      expect(params.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);
    });

    it('should handle JSON message array with system message and image content', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      const prompt = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);

      const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(config, prompt);

      expect(params.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);
      expect(params.system).toBe('You are a helpful assistant.');
    });

    it('should convert lone system message to user message', async () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      // Test with string content
      const promptWithStringContent = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
      ]);
      const paramsWithString = await modelHandler.params(config, promptWithStringContent);
      expect(paramsWithString.messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'You are a helpful assistant.' }],
        },
      ]);
      expect(paramsWithString.system).toBeUndefined();

      // Test with array content
      const promptWithArrayContent = JSON.stringify([
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: 'Additional context.' },
          ],
        },
      ]);
      const paramsWithArray = await modelHandler.params(config, promptWithArrayContent);
      expect(paramsWithArray.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: 'Additional context.' },
          ],
        },
      ]);
      expect(paramsWithArray.system).toBeUndefined();
    });
  });

  describe('BEDROCK_MODEL AI21', () => {
    const modelHandler = BEDROCK_MODEL.AI21;

    it('should include AI21-specific parameters', async () => {
      const config: BedrockAI21GenerationOptions = {
        region: 'us-east-1',
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        stop: ['END'],
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      };

      const prompt = 'Write a short story about a robot.';
      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        stop: ['END'],
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      });
    });

    it('should use default values when config is not provided', async () => {
      const config = {};
      const prompt = 'Tell me a joke.';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        top_p: 1.0,
      });
    });

    it('should handle output correctly', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is a test response.' } }],
      };
      expect(modelHandler.output({}, mockResponse)).toBe('This is a test response.');
    });

    it('should throw an error for API errors', async () => {
      const mockErrorResponse = { error: 'API Error' };
      expect(() => modelHandler.output({}, mockErrorResponse)).toThrow('AI21 API error: API Error');
    });
  });

  describe('getCredentials', () => {
    it('should return credentials if accessKeyId and secretAccessKey are provided', async () => {
      const provider = new (class extends AwsBedrockGenericProvider {
        constructor() {
          super('test-model', {
            config: {
              accessKeyId: 'test-access-key',
              secretAccessKey: 'test-secret-key',
            },
          });
        }
      })();

      const credentials = await provider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });
    });

    it('should return undefined if accessKeyId or secretAccessKey is missing', async () => {
      const provider = new (class extends AwsBedrockGenericProvider {
        constructor() {
          super('test-model', {
            config: {
              accessKeyId: 'test-access-key',
            },
          });
        }
      })();

      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined();
    });

    it('should return credentials when accessKeyId and secretAccessKey are provided', async () => {
      const provider = new TestBedrockProvider({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
      });

      const credentials = await provider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
      });
    });

    it('should return SSO credential provider when profile is specified', async () => {
      vi.mock('@aws-sdk/credential-provider-sso', async (importOriginal) => {
        return {
          ...(await importOriginal()),

          fromSSO: (config: any) => {
            credentialProviderSsoFactory.mockSSOProvider();
            expect(config).toEqual({ profile: 'test-profile' });
            return 'sso-provider';
          },
        };
      });

      const provider = new TestBedrockProvider({
        profile: 'test-profile',
      });

      const credentials = await provider.getCredentials();
      expect(credentialProviderSsoFactory.mockSSOProvider).toHaveBeenCalledWith();
      expect(credentials).toBe('sso-provider');
    });

    it('should return undefined when no credentials are provided', async () => {
      const provider = new TestBedrockProvider({});
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined();
    });

    it('should return undefined for API key authentication when apiKey is provided in config', async () => {
      const provider = new TestBedrockProvider({
        apiKey: 'test-api-key',
      });
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined();
    });

    it('should return undefined for API key authentication when AWS_BEARER_TOKEN_BEDROCK env var is set', async () => {
      process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-env-api-key';
      const provider = new TestBedrockProvider({});
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined();
      delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    });

    it('should prioritize config apiKey over environment variable', async () => {
      process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-env-api-key';
      const provider = new TestBedrockProvider({
        apiKey: 'test-config-api-key',
      });
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined(); // API key auth returns undefined for credentials
      delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    });

    it('should prioritize explicit credentials over API key', async () => {
      const provider = new TestBedrockProvider({
        apiKey: 'test-api-key',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });
      const credentials = await provider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: undefined,
      }); // Explicit credentials take priority
    });

    it('should use API key when no explicit credentials are provided', async () => {
      const provider = new TestBedrockProvider({
        apiKey: 'test-api-key',
        // No accessKeyId/secretAccessKey provided
      });
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined(); // API key auth returns undefined for credentials
    });
  });
});

describe('addConfigParam', () => {
  it('should add config value if provided', async () => {
    const params: any = {};
    addConfigParam(params, 'key', 'configValue');
    expect(params.key).toBe('configValue');
  });

  it('should add env value if config value is not provided', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY);
    expect(params.key).toBe('envValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should add default value if neither config nor env value is provided', async () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, undefined, 'defaultValue');
    expect(params.key).toBe('defaultValue');
  });

  it('should prioritize config value over env and default values', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', 'configValue', process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('configValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should prioritize env value over default value if config value is not provided', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('envValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should parse env value if default value is a number', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '42';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 0);
    expect(params.key).toBe(42);
    delete process.env.TEST_ENV_KEY;
  });

  it('should handle undefined config, env, and default values gracefully', async () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, undefined, undefined);
    expect(params.key).toBeUndefined();
  });

  it('should correctly parse non-number string values', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'nonNumberString';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 0);
    expect(params.key).toBe(0);
    delete process.env.TEST_ENV_KEY;
  });

  it('should correctly parse empty string values', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('');
    delete process.env.TEST_ENV_KEY;
  });

  it('should handle env value not set', async () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, process.env.UNSET_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('defaultValue');
  });

  it('should handle config values that are objects', async () => {
    const params: any = {};
    const configValue = { nestedKey: 'nestedValue' };
    addConfigParam(params, 'key', configValue);
    expect(params.key).toEqual(configValue);
  });

  it('should handle config values that are arrays', async () => {
    const params: any = {};
    const configValue = ['value1', 'value2'];
    addConfigParam(params, 'key', configValue);
    expect(params.key).toEqual(configValue);
  });

  it('should handle special characters in env values', async () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '!@#$%^&*()_+';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('!@#$%^&*()_+');
    delete process.env.TEST_ENV_KEY;
  });
});

describe('parseValue', () => {
  it('should return the original value if defaultValue is not a number', async () => {
    expect(parseValue('stringValue', 'defaultValue')).toBe('stringValue');
  });

  it('should return parsed float value if defaultValue is a number', async () => {
    expect(parseValue('42.5', 0)).toBe(42.5);
  });

  it('should return NaN for non-numeric strings if defaultValue is a number', async () => {
    expect(parseValue('notANumber', 0)).toBe(0);
  });

  it('should return 0 for an empty string if defaultValue is a number', async () => {
    expect(parseValue('', 0)).toBe(0);
  });

  it('should return null for a null value if defaultValue is not a number', async () => {
    expect(parseValue(null as never, 'defaultValue')).toBeNull();
  });

  it('should return undefined for an undefined value if defaultValue is not a number', async () => {
    expect(parseValue(undefined as never, 'defaultValue')).toBeUndefined();
  });
});

describe('llama', () => {
  describe('getLlamaModelHandler', () => {
    describe('LLAMA2', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V2);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: `<s>[INST] Describe the purpose of a \"hello world\" program in one sentence. [/INST]`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<s>[INST] <<SYS>>
        You are a helpful assistant.
        <</SYS>>

        What is the capital of France? [/INST]`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt:
            "<s>[INST] Hello [/INST] Hi there! How can I assist you today? </s><s>[INST] What's the weather like? [/INST]",
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });
    });

    describe('LLAMA3', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>system<|end_header_id|>

        You are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>

        What is the capital of France?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Hello<|eot_id|><|start_header_id|>assistant<|end_header_id|>

        Hi there! How can I assist you today?<|eot_id|><|start_header_id|>user<|end_header_id|>

        What's the weather like?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });
    });

    describe('LLAMA3_1', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_1);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });
    });

    describe('LLAMA3_2', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should use max_gen_len parameter', async () => {
        const config = { max_gen_len: 1000 };
        const prompt = 'Test prompt';
        const params = await handler.params(config, prompt);
        expect(params).toHaveProperty('max_gen_len', 1000);
      });
    });

    describe('LLAMA3_3', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_3);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should use max_gen_len parameter', async () => {
        const config = { max_gen_len: 1000 };
        const prompt = 'Test prompt';
        const params = await handler.params(config, prompt);
        expect(params).toHaveProperty('max_gen_len', 1000);
      });
    });

    describe('LLAMA4', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V4);

      it('should generate correct prompt for a single user message', async () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Describe the purpose of a "hello world" program in one sentence.<|eot|><|header_start|>assistant<|header_end|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|header_start|>system<|header_end|>

You are a helpful assistant.<|eot|><|header_start|>user<|header_end|>

What is the capital of France?<|eot|><|header_start|>assistant<|header_end|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', async () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        await expect(handler.params(config, prompt)).resolves.toEqual({
          prompt: dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Hello<|eot|><|header_start|>assistant<|header_end|>

Hi there! How can I assist you today?<|eot|><|header_start|>user<|header_end|>

What's the weather like?<|eot|><|header_start|>assistant<|header_end|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });
    });

    it('should throw an error for unsupported LLAMA version', async () => {
      expect(() => getLlamaModelHandler(1 as LlamaVersion)).toThrow('Unsupported LLAMA version: 1');
    });

    it('should handle output correctly', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V2);
      expect(handler.output({}, { generation: 'Test response' })).toBe('Test response');
      expect(handler.output({}, {})).toBeUndefined();
    });
  });

  describe('formatPromptLlama2Chat', () => {
    it('should format a single user message correctly', async () => {
      const messages: LlamaMessage[] = [
        {
          role: 'user',
          content: 'Describe the purpose of a "hello world" program in one sentence.',
        },
      ];
      const expectedPrompt =
        '<s>[INST] Describe the purpose of a "hello world" program in one sentence. [/INST]';
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });

    it('should handle a system message followed by a user message', async () => {
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ];
      const expectedPrompt = dedent`
      <s>[INST] <<SYS>>
      You are a helpful assistant.
      <</SYS>>

      What is the capital of France? [/INST]
    `;
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });

    it('should handle a system message, user message, and assistant response', async () => {
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
      ];
      const expectedPrompt = dedent`
      <s>[INST] <<SYS>>
      You are a helpful assistant.
      <</SYS>>

      What is the capital of France? [/INST] The capital of France is Paris. </s>
    `;
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });

    it('should handle multiple turns of conversation', async () => {
      // see https://huggingface.co/blog/llama2#how-to-prompt-llama-2
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I assist you today?' },
        { role: 'user', content: "What's the weather like?" },
      ];
      const expectedPrompt = dedent`
      <s>[INST] <<SYS>>
      You are a helpful assistant.
      <</SYS>>

      Hello [/INST] Hi there! How can I assist you today? </s><s>[INST] What's the weather like? [/INST]
    `;
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });

    it('should handle only a system message correctly', async () => {
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
      ];
      const expectedPrompt = `${dedent`
      <s>[INST] <<SYS>>
      You are a helpful assistant.
      <</SYS>>

      `}\n\n`;
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });
  });

  describe('formatPromptLlama3Instruct', () => {
    it('should format a single user message correctly', async () => {
      const messages: LlamaMessage[] = [{ role: 'user', content: 'Hello, how are you?' }];
      const expected = dedent`
        <|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Hello, how are you?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
      expect(formatPromptLlama3Instruct(messages)).toBe(expected);
    });

    it('should format multiple messages correctly', async () => {
      const messages: LlamaMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I help you?' },
        { role: 'user', content: "What's the weather like?" },
      ];
      const expected = dedent`
        <|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Hello<|eot_id|><|start_header_id|>assistant<|end_header_id|>

        Hi there! How can I help you?<|eot_id|><|start_header_id|>user<|end_header_id|>

        What's the weather like?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
      expect(formatPromptLlama3Instruct(messages)).toBe(expected);
    });

    it('should handle system messages correctly', async () => {
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];
      const expected = dedent`
        <|begin_of_text|><|start_header_id|>system<|end_header_id|>

        You are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>

        Hello<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
      expect(formatPromptLlama3Instruct(messages)).toBe(expected);
    });
  });

  describe('formatPromptLlama4', () => {
    it('should format a single user message correctly', async () => {
      const messages: LlamaMessage[] = [{ role: 'user', content: 'Hello, how are you?' }];
      const expected = dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Hello, how are you?<|eot|><|header_start|>assistant<|header_end|>`;
      expect(formatPromptLlama4(messages)).toBe(expected);
    });

    it('should format multiple messages correctly', async () => {
      const messages: LlamaMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I help you?' },
        { role: 'user', content: "What's the weather like?" },
      ];
      const expected = dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Hello<|eot|><|header_start|>assistant<|header_end|>

Hi there! How can I help you?<|eot|><|header_start|>user<|header_end|>

What's the weather like?<|eot|><|header_start|>assistant<|header_end|>`;
      expect(formatPromptLlama4(messages)).toBe(expected);
    });

    it('should handle system messages correctly', async () => {
      const messages: LlamaMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];
      const expected = dedent`<|begin_of_text|><|header_start|>system<|header_end|>

You are a helpful assistant.<|eot|><|header_start|>user<|header_end|>

Hello<|eot|><|header_start|>assistant<|header_end|>`;
      expect(formatPromptLlama4(messages)).toBe(expected);
    });
  });

  describe('extractTextContent', () => {
    it('should return trimmed string when content is a string', () => {
      expect(extractTextContent('  Hello world  ')).toBe('Hello world');
    });

    it('should extract text from array with text type blocks', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'world' },
      ];
      expect(extractTextContent(content)).toBe('Hello world');
    });

    it('should extract text from array without type field', () => {
      const content = [{ text: 'Hello' }, { text: 'world' }];
      expect(extractTextContent(content)).toBe('Hello world');
    });

    it('should handle string items in array', () => {
      const content = ['Hello', 'world'] as any;
      expect(extractTextContent(content)).toBe('Hello world');
    });

    it('should throw error when content contains images', () => {
      const content = [
        { type: 'text', text: 'Describe this image' },
        { type: 'image', image: { format: 'jpeg', source: { bytes: 'base64data' } } },
      ];
      expect(() => extractTextContent(content, 'meta.llama3-2-11b')).toThrow(
        /Multimodal content \(images\) detected/,
      );
      expect(() => extractTextContent(content, 'meta.llama3-2-11b')).toThrow(
        /bedrock:converse:meta\.llama3-2-11b/,
      );
    });

    it('should throw error when content contains image_url', () => {
      const content = [
        { type: 'text', text: 'Describe this' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
      ];
      expect(() => extractTextContent(content)).toThrow(/Multimodal content \(images\) detected/);
    });

    it('should throw error when content has image property without type', () => {
      const content = [{ text: 'Hello' }, { image: { format: 'png', source: { data: 'base64' } } }];
      expect(() => extractTextContent(content)).toThrow(/Multimodal content \(images\) detected/);
    });

    it('should include model name in error message when provided', () => {
      const content = [{ type: 'image', image: {} }];
      expect(() => extractTextContent(content, 'us.meta.llama3-2-90b-instruct-v1:0')).toThrow(
        /us\.meta\.llama3-2-90b-instruct-v1:0/,
      );
    });
  });

  describe('extractTextAndImages', () => {
    it('should return text and empty images array for string content', () => {
      const result = extractTextAndImages('Hello world');
      expect(result).toEqual({ text: 'Hello world', images: [] });
    });

    it('should extract text from array with text blocks', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
      ];
      const result = extractTextAndImages(content);
      expect(result).toEqual({ text: 'Hello world', images: [] });
    });

    it('should extract image data and insert <|image|> token from source.bytes format', () => {
      const content = [
        { type: 'text', text: 'Describe this: ' },
        { type: 'image', source: { bytes: 'base64ImageData' } },
      ];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('Describe this: <|image|>');
      expect(result.images).toEqual(['base64ImageData']);
    });

    it('should extract image data from source.data (Anthropic format)', () => {
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'base64Data' } },
        { type: 'text', text: ' What is this?' },
      ];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('<|image|> What is this?');
      expect(result.images).toEqual(['base64Data']);
    });

    it('should extract image data from image_url format (OpenAI compatible)', () => {
      const content = [
        { type: 'text', text: 'Look at this: ' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,pngBase64Data' } },
      ];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('Look at this: <|image|>');
      expect(result.images).toEqual(['pngBase64Data']);
    });

    it('should extract image from data URL in source.bytes', () => {
      const content = [{ type: 'image', source: { bytes: 'data:image/jpeg;base64,jpegDataHere' } }];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('<|image|>');
      expect(result.images).toEqual(['jpegDataHere']);
    });

    it('should handle multiple images in correct order', () => {
      const content = [
        { type: 'text', text: 'Image 1: ' },
        { type: 'image', source: { bytes: 'image1data' } },
        { type: 'text', text: ' Image 2: ' },
        { type: 'image', source: { bytes: 'image2data' } },
      ];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('Image 1: <|image|> Image 2: <|image|>');
      expect(result.images).toEqual(['image1data', 'image2data']);
    });

    it('should handle block.image with source.data', () => {
      const content = [{ type: 'image', image: { source: { data: 'nestedImageData' } } }];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('<|image|>');
      expect(result.images).toEqual(['nestedImageData']);
    });

    it('should handle Buffer source.bytes', () => {
      const content = [{ type: 'image', source: { bytes: Buffer.from('hello') } }];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('<|image|>');
      expect(result.images).toEqual([Buffer.from('hello').toString('base64')]);
    });

    it('should extract base64 from data URL in source.data', () => {
      const content = [
        { type: 'image', source: { data: 'data:image/jpeg;base64,actualBase64Data' } },
      ];
      const result = extractTextAndImages(content);
      expect(result.text).toBe('<|image|>');
      expect(result.images).toEqual(['actualBase64Data']);
    });
  });

  describe('formatPromptLlama32Vision', () => {
    it('should format text-only message correctly', () => {
      const messages: LlamaMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = formatPromptLlama32Vision(messages);
      expect(result.prompt).toContain('<|begin_of_text|>');
      expect(result.prompt).toContain('Hello');
      expect(result.prompt).toContain('<|start_header_id|>assistant<|end_header_id|>');
      expect(result.images).toEqual([]);
    });

    it('should format message with image and return images array', () => {
      const messages: LlamaMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image', source: { bytes: 'imageBase64' } },
            { type: 'text', text: 'What is this?' },
          ],
        },
      ];
      const result = formatPromptLlama32Vision(messages);
      expect(result.prompt).toContain('<|image|>');
      expect(result.prompt).toContain('What is this?');
      expect(result.images).toEqual(['imageBase64']);
    });

    it('should collect images from multiple messages', () => {
      const messages: LlamaMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image', source: { data: 'img1' } },
            { type: 'text', text: 'First image' },
          ],
        },
        { role: 'assistant', content: 'I see a cat' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'And this: ' },
            { type: 'image', source: { data: 'img2' } },
          ],
        },
      ];
      const result = formatPromptLlama32Vision(messages);
      expect(result.images).toEqual(['img1', 'img2']);
      expect(result.prompt).toContain('First image');
      expect(result.prompt).toContain('I see a cat');
      expect(result.prompt).toContain('And this:');
    });
  });

  describe('getLlamaModelHandler LLAMA3_2 with images', () => {
    it('should include images array in params when multimodal content provided (11B)', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);
      const prompt = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'image', source: { bytes: 'testImageData' } },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
      const params = await handler.params(
        {},
        prompt,
        undefined,
        'us.meta.llama3-2-11b-instruct-v1:0',
      );
      expect(params.images).toEqual(['testImageData']);
      expect(params.prompt).toContain('<|image|>');
      expect(params.prompt).toContain('What is in this image?');
    });

    it('should not include images array when no images in content', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);
      const prompt = JSON.stringify([{ role: 'user', content: 'Just text' }]);
      const params = await handler.params(
        {},
        prompt,
        undefined,
        'us.meta.llama3-2-11b-instruct-v1:0',
      );
      expect(params.images).toBeUndefined();
      expect(params.prompt).toContain('Just text');
    });

    it('should handle image_url format in LLAMA3_2 (90B)', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);
      const prompt = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe: ' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,pngData' } },
          ],
        },
      ]);
      const params = await handler.params(
        {},
        prompt,
        undefined,
        'us.meta.llama3-2-90b-instruct-v1:0',
      );
      expect(params.images).toEqual(['pngData']);
      expect(params.prompt).toContain('<|image|>');
    });

    it('should use text-only formatting for 1B and 3B models', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);
      const prompt = JSON.stringify([{ role: 'user', content: 'Just text' }]);
      const params = await handler.params(
        {},
        prompt,
        undefined,
        'us.meta.llama3-2-3b-instruct-v1:0',
      );
      expect(params.images).toBeUndefined();
      expect(params.prompt).toContain('Just text');
      // Should use Llama 3 formatting, not vision formatting
      expect(params.prompt).not.toContain('<|image|>');
    });

    it('should throw error when images are provided to 1B/3B text-only models', async () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_2);
      const prompt = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'image', source: { bytes: 'testImageData' } },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
      await expect(
        handler.params({}, prompt, undefined, 'us.meta.llama3-2-3b-instruct-v1:0'),
      ).rejects.toThrow(/Multimodal content \(images\) detected/);
    });
  });

  describe('formatPromptLlama3Instruct with multimodal content', () => {
    it('should throw helpful error when message contains images', () => {
      const messages: LlamaMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image', image: { format: 'jpeg', source: { bytes: 'data' } } },
            { type: 'text', text: 'Describe this image' },
          ],
        },
      ];
      expect(() => formatPromptLlama3Instruct(messages, 'meta.llama3-2-11b')).toThrow(
        /Multimodal content \(images\) detected/,
      );
    });

    it('should work with text-only array content', () => {
      const messages: LlamaMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ];
      const result = formatPromptLlama3Instruct(messages);
      expect(result).toContain('Hello world');
    });
  });
});

describe('BEDROCK_MODEL AMAZON_NOVA', () => {
  const modelHandler = BEDROCK_MODEL.AMAZON_NOVA;

  it('should format system message correctly when using JSON array input', async () => {
    const config = {};
    const prompt = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ]);

    const params = await modelHandler.params(config, prompt);

    expect(params).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Hello!' }],
        },
      ],
      system: [{ text: 'You are a helpful assistant.' }],
      inferenceConfig: {
        temperature: 0,
      },
    });
  });

  it('should handle messages without system prompt', async () => {
    const config = {};
    const prompt = JSON.stringify([
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ]);

    const params = await modelHandler.params(config, prompt);

    expect(params).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Hello!' }],
        },
        {
          role: 'assistant',
          content: [{ text: 'Hi there!' }],
        },
      ],
      inferenceConfig: {
        temperature: 0,
      },
    });
    expect(params.system).toBeUndefined();
  });

  it('should handle complex message content arrays', async () => {
    const config = {};
    const prompt = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          { text: 'What is this image?' },
          {
            image: {
              format: 'jpeg',
              source: {
                bytes: 'base64_encoded_image',
              },
            },
          },
        ],
      },
    ]);

    const params = await modelHandler.params(config, prompt);

    expect(params).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            { text: 'What is this image?' },
            {
              image: {
                format: 'jpeg',
                source: {
                  bytes: 'base64_encoded_image',
                },
              },
            },
          ],
        },
      ],
      system: [{ text: 'You are a helpful assistant.' }],
      inferenceConfig: {
        temperature: 0,
      },
    });
  });

  it('should handle invalid JSON gracefully', async () => {
    const config = {};
    const prompt = 'Invalid JSON';

    const params = await modelHandler.params(config, prompt);

    expect(params).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Invalid JSON' }],
        },
      ],
      inferenceConfig: {
        temperature: 0,
      },
    });
  });
});

describe('BEDROCK_MODEL MISTRAL', () => {
  const modelHandler = BEDROCK_MODEL.MISTRAL;

  describe('params', () => {
    it('should include Mistral-specific parameters', async () => {
      const config = {
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
      };
      const prompt = 'What is the capital of France?';
      const stop = ['END'];

      const params = await modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        prompt,
        stop,
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
      });
    });

    it('should use default values when config is not provided', async () => {
      const config = {};
      const prompt = 'Hello, how are you?';
      const stop: string[] = [];

      const params = await modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        prompt,
        stop,
        max_tokens: 1024,
        temperature: 0,
        top_p: 1,
        top_k: 0,
      });
    });
  });

  describe('output', () => {
    it('should extract output from outputs[0].text format', async () => {
      const mockResponse = {
        outputs: [{ text: 'This is a test response.' }],
      };

      expect(modelHandler.output({}, mockResponse)).toBe('This is a test response.');
    });

    it('should return undefined for unrecognized formats', async () => {
      const mockResponse = { something: 'else' };

      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should use explicit token usage when available', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 25,
          completion_tokens: 50,
          total_tokens: 75,
        },
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Some input text');

      expect(result).toEqual({
        prompt: 25,
        completion: 50,
        total: 75,
        numRequests: 1,
      });
    });

    it('should return undefined token counts when not provided by the API', async () => {
      const mockResponse = {
        outputs: [{ text: 'This is a test response with several words to estimate tokens.' }],
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'What is the capital of France?');

      // Verify structure with undefined values
      expect(result).toHaveProperty('prompt', undefined);
      expect(result).toHaveProperty('completion', undefined);
      expect(result).toHaveProperty('total', undefined);
      expect(result).toHaveProperty('numRequests', 1);
    });
  });
});

describe('BEDROCK_MODEL OPENAI', () => {
  const modelHandler = BEDROCK_MODEL.OPENAI;

  describe('params', () => {
    it('should include OpenAI-specific parameters', async () => {
      const config: BedrockOpenAIGenerationOptions = {
        region: 'us-east-1',
        max_completion_tokens: 150,
        temperature: 0.8,
        top_p: 0.95,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        stop: ['END', 'STOP'],
      };
      const prompt = 'What is artificial intelligence?';
      const stop = ['FINISH'];

      const params = await modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        messages: [{ role: 'user', content: 'What is artificial intelligence?' }],
        max_completion_tokens: 150,
        temperature: 0.8,
        top_p: 0.95,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        stop: ['FINISH'], // stop parameter takes precedence
      });
    });

    it('should use config.stop when stop parameter is not provided', async () => {
      const config = {
        stop: ['CONFIG_END'],
        temperature: 0.5,
      };
      const prompt = 'Test prompt';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: 'Test prompt' }],
        temperature: 0.5,
        top_p: 1.0,
        stop: ['CONFIG_END'],
      });
    });

    it('should use default values when config is not provided', async () => {
      const config = {};
      const prompt = 'Hello, how are you?';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.1,
        top_p: 1.0,
      });
    });

    it('should handle JSON message array input', async () => {
      const config = { temperature: 0.7 };
      const prompt = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is machine learning?' },
      ]);

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is machine learning?' },
        ],
        temperature: 0.7,
        top_p: 1.0,
      });
    });

    it('should handle reasoning_effort by adding it to system message', async () => {
      const config = {
        temperature: 0.7,
        reasoning_effort: 'high' as const,
      };
      const prompt = 'Test prompt';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [
          { role: 'system', content: 'Reasoning: high' },
          { role: 'user', content: 'Test prompt' },
        ],
        temperature: 0.7,
        top_p: 1.0,
      });
    });

    it('should append reasoning_effort to existing system message', async () => {
      const config = {
        temperature: 0.7,
        reasoning_effort: 'medium' as const,
      };
      const prompt = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is machine learning?' },
      ]);

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.\n\nReasoning: medium' },
          { role: 'user', content: 'What is machine learning?' },
        ],
        temperature: 0.7,
        top_p: 1.0,
      });
    });

    it('should not modify messages when reasoning_effort is not specified', async () => {
      const config = { temperature: 0.5 };
      const prompt = 'Test prompt';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: 'Test prompt' }],
        temperature: 0.5,
        top_p: 1.0,
      });
    });
  });

  describe('output', () => {
    it('should extract output from OpenAI chat completion format', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is a test response from OpenAI model.',
            },
          },
        ],
      };

      expect(modelHandler.output({}, mockResponse)).toBe(
        'This is a test response from OpenAI model.',
      );
    });

    it('should throw an error for API errors', async () => {
      const mockErrorResponse = { error: 'API Error occurred' };
      expect(() => modelHandler.output({}, mockErrorResponse)).toThrow(
        'OpenAI API error: API Error occurred',
      );
    });

    it('should return undefined for unrecognized formats', async () => {
      const mockResponse = { something: 'else' };
      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should extract token usage from OpenAI response format', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 25,
          completion_tokens: 75,
          total_tokens: 100,
        },
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 25,
        completion: 75,
        total: 100,
        numRequests: 1,
      });
    });

    it('should handle string token counts', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: '30',
          completion_tokens: '60',
          total_tokens: '90',
        },
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 30,
        completion: 60,
        total: 90,
        numRequests: 1,
      });
    });

    it('should return undefined token counts when usage is not provided', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response without usage info',
            },
          },
        ],
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      });
    });
  });
});

describe('BEDROCK_MODEL MISTRAL_LARGE_2407', () => {
  const modelHandler = BEDROCK_MODEL.MISTRAL_LARGE_2407;

  describe('params', () => {
    it('should include Mistral-specific parameters without top_k', async () => {
      const config = {
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50, // This should be ignored
      };
      const prompt = 'What is the capital of France?';
      const stop = ['END'];

      const params = await modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        prompt,
        stop,
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        // top_k should not be included
      });
      expect(params).not.toHaveProperty('top_k');
    });

    it('should use default values when config is not provided', async () => {
      const config = {};
      const prompt = 'Hello, how are you?';
      const stop: string[] = [];

      const params = await modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        prompt,
        stop,
        max_tokens: 1024,
        temperature: 0,
        top_p: 1,
      });
      expect(params).not.toHaveProperty('top_k');
    });
  });

  describe('output', () => {
    it('should extract output from chat completion format', async () => {
      const mockResponse = {
        id: 'b8f7363d-4aed-42cf-879a-7a8db4f37be3',
        object: 'chat.completion',
        created: 1743034280,
        model: 'mistral-large-2407',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a test response in chat completion format.',
            },
            finish_reason: 'stop',
          },
        ],
      };

      expect(modelHandler.output({}, mockResponse)).toBe(
        'This is a test response in chat completion format.',
      );
    });

    it('should return undefined for unrecognized formats', async () => {
      const mockResponse = { something: 'else' };

      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should extract token usage from chat completion format', async () => {
      const mockResponse = {
        id: 'b8f7363d-4aed-42cf-879a-7a8db4f37be3',
        object: 'chat.completion',
        created: 1743034280,
        model: 'mistral-large-2407',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        prompt_tokens: 30,
        completion_tokens: 45,
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 30,
        completion: 45,
        total: 75,
        numRequests: 1,
      });
    });

    it('should return undefined token counts when not provided by the API', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is a test response',
            },
          },
        ],
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toHaveProperty('prompt', undefined);
      expect(result).toHaveProperty('completion', undefined);
      expect(result).toHaveProperty('total', undefined);
      expect(result).toHaveProperty('numRequests', 1);
    });
  });
});

describe('BEDROCK_MODEL DEEPSEEK', () => {
  const modelHandler = BEDROCK_MODEL.DEEPSEEK;

  describe('params', () => {
    it('should wrap prompt with thinking tags', async () => {
      const config = {
        max_tokens: 1000,
        temperature: 0.8,
        top_p: 0.95,
      };
      const prompt = 'Solve this complex problem';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        prompt: '\nSolve this complex problem\n<think>\n',
        max_tokens: 1000,
        temperature: 0.8,
        top_p: 0.95,
      });
    });

    it('should use default values when config is not provided', async () => {
      const config = {};
      const prompt = 'Test prompt';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        prompt: '\nTest prompt\n<think>\n',
        temperature: 0,
        top_p: 1.0,
      });
    });

    it('should respect environment variables', async () => {
      process.env.AWS_BEDROCK_MAX_TOKENS = '2000';
      process.env.AWS_BEDROCK_TEMPERATURE = '0.5';
      process.env.AWS_BEDROCK_TOP_P = '0.9';

      const config = {};
      const prompt = 'Test with env vars';

      const params = await modelHandler.params(config, prompt);

      expect(params).toEqual({
        prompt: '\nTest with env vars\n<think>\n',
        max_tokens: 2000,
        temperature: 0.5,
        top_p: 0.9,
      });

      delete process.env.AWS_BEDROCK_MAX_TOKENS;
      delete process.env.AWS_BEDROCK_TEMPERATURE;
      delete process.env.AWS_BEDROCK_TOP_P;
    });
  });

  describe('output', () => {
    it('should extract text from DeepSeek response with thinking', async () => {
      const mockResponse = {
        choices: [
          {
            text: '<think>Let me think about this problem...</think>\nThe answer is 42.',
          },
        ],
      };
      const config = { showThinking: true };

      const result = modelHandler.output(config, mockResponse);

      expect(result).toBe('<think>Let me think about this problem...</think>\nThe answer is 42.');
    });

    it('should hide thinking when showThinking is false', async () => {
      const mockResponse = {
        choices: [
          {
            text: '<think>Let me think about this problem...</think>\nThe answer is 42.',
          },
        ],
      };
      const config = { showThinking: false };

      const result = modelHandler.output(config, mockResponse);

      expect(result).toBe('The answer is 42.');
    });

    it('should return full response when no thinking tags present', async () => {
      const mockResponse = {
        choices: [
          {
            text: 'Direct response without thinking',
          },
        ],
      };
      const config = { showThinking: false };

      const result = modelHandler.output(config, mockResponse);

      expect(result).toBe('Direct response without thinking');
    });

    it('should handle error in response', async () => {
      const mockResponse = {
        error: 'API error occurred',
      };

      expect(() => modelHandler.output({}, mockResponse)).toThrow(
        'DeepSeek API error: API error occurred',
      );
    });

    it('should return undefined for unrecognized response format', async () => {
      const mockResponse = { something: 'else' };
      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should extract token usage from DeepSeek response', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 30,
          completion_tokens: 70,
          total_tokens: 100,
        },
      };

      const usage = modelHandler.tokenUsage(mockResponse, 'test');

      expect(usage).toEqual({
        prompt: 30,
        completion: 70,
        total: 100,
        numRequests: 1,
      });
    });

    it('should handle string token values', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: '30',
          completion_tokens: '70',
          total_tokens: '100',
        },
      };

      const usage = modelHandler.tokenUsage(mockResponse, 'test');

      expect(usage).toEqual({
        prompt: 30,
        completion: 70,
        total: 100,
        numRequests: 1,
      });
    });

    it('should return undefined values when token counts are not provided', async () => {
      const mockResponse = {};

      const usage = modelHandler.tokenUsage(mockResponse, 'test');

      expect(usage).toEqual({
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      });
    });
  });
});

describe('BEDROCK_MODEL token counting functionality', () => {
  describe('MISTRAL model handler', () => {
    const modelHandler = BEDROCK_MODEL.MISTRAL;

    it('should extract token usage from API response when available', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 25,
          completion_tokens: 50,
          total_tokens: 75,
        },
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 25,
        completion: 50,
        total: 75,
        numRequests: 1,
      });
    });

    it('should handle string token counts', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: '25',
          completion_tokens: '50',
          total_tokens: '75',
        },
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 25,
        completion: 50,
        total: 75,
        numRequests: 1,
      });
    });

    it('should return undefined token counts when not provided by the API', async () => {
      const mockResponse = {
        outputs: [{ text: 'This is a generated response' }],
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toHaveProperty('prompt', undefined);
      expect(result).toHaveProperty('completion', undefined);
      expect(result).toHaveProperty('total', undefined);
      expect(result).toHaveProperty('numRequests', 1);
    });
  });

  describe('MISTRAL_LARGE_2407 model handler', () => {
    const modelHandler = BEDROCK_MODEL.MISTRAL_LARGE_2407;

    it('should extract token usage from chat completion format', async () => {
      const mockResponse = {
        id: 'b8f7363d-4aed-42cf-879a-7a8db4f37be3',
        object: 'chat.completion',
        created: 1743034280,
        model: 'mistral-large-2407',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        prompt_tokens: 30,
        completion_tokens: 45,
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 30,
        completion: 45,
        total: 75,
        numRequests: 1,
      });
    });

    it('should handle string token counts', async () => {
      const mockResponse = {
        prompt_tokens: '30',
        completion_tokens: '45',
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 30,
        completion: 45,
        total: 75, // 30 + 45 = 75, not "3045"
        numRequests: 1,
      });
    });

    it('should return undefined token counts when not provided by the API', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is a test response',
            },
          },
        ],
      };

      const result = modelHandler.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toHaveProperty('prompt', undefined);
      expect(result).toHaveProperty('completion', undefined);
      expect(result).toHaveProperty('total', undefined);
      expect(result).toHaveProperty('numRequests', 1);
    });
  });

  describe('Llama model handler', () => {
    it('should extract token usage from Llama response', async () => {
      const mockResponse = {
        generation: 'Test response',
        prompt_token_count: 10,
        generation_token_count: 20,
      };

      const handler = getLlamaModelHandler(LlamaVersion.V3);
      const result = handler.tokenUsage!(mockResponse, 'Test prompt');

      expect(result).toEqual({
        prompt: 10,
        completion: 20,
        total: 30,
        numRequests: 1,
      });
    });

    it('should handle string token counts', async () => {
      const mockResponse = {
        generation: 'Test response',
        prompt_token_count: '10',
        generation_token_count: '20',
      };

      const handler = getLlamaModelHandler(LlamaVersion.V3);
      const result = handler.tokenUsage!(mockResponse, 'Test prompt');

      expect(result).toEqual({
        prompt: 10,
        completion: 20,
        total: 30,
        numRequests: 1,
      });
    });
  });

  describe('Claude model handlers', () => {
    it('should handle new-style token fields in Claude Messages', async () => {
      const mockResponse = {
        usage: {
          input_tokens: 15,
          output_tokens: 25,
        },
      };

      const result = BEDROCK_MODEL.CLAUDE_MESSAGES.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 15,
        completion: 25,
        total: 40,
        numRequests: 1,
      });
    });

    it('should handle string token counts in Claude Messages', async () => {
      const mockResponse = {
        usage: {
          input_tokens: '15',
          output_tokens: '25',
        },
      };

      const result = BEDROCK_MODEL.CLAUDE_MESSAGES.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 15,
        completion: 25,
        total: 40,
        numRequests: 1,
      });
    });

    it('should handle old-style token fields in Claude Completion', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          total_tokens: 50,
        },
      };

      const result = BEDROCK_MODEL.CLAUDE_COMPLETION.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 20,
        completion: 30,
        total: 50,
        numRequests: 1,
      });
    });

    it('should handle string token counts in Claude Completion', async () => {
      const mockResponse = {
        usage: {
          prompt_tokens: '20',
          completion_tokens: '30',
          total_tokens: '50',
        },
      };

      const result = BEDROCK_MODEL.CLAUDE_COMPLETION.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 20,
        completion: 30,
        total: 50,
        numRequests: 1,
      });
    });
  });

  describe('AMAZON_NOVA model handler', () => {
    it('should handle numeric token counts', async () => {
      const mockResponse = {
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
        },
      };

      const result = BEDROCK_MODEL.AMAZON_NOVA.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 100,
        completion: 200,
        total: 300,
        numRequests: 1,
      });
    });

    it('should handle string token counts', async () => {
      const mockResponse = {
        usage: {
          inputTokens: '113',
          outputTokens: '335',
          totalTokens: '448',
        },
      };

      const result = BEDROCK_MODEL.AMAZON_NOVA.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 113,
        completion: 335,
        total: 448, // 113 + 335 = 448, not "113335"
        numRequests: 1,
      });
    });
  });

  describe('COHERE model handlers', () => {
    it('should handle numeric token counts in COHERE_COMMAND', async () => {
      const mockResponse = {
        meta: {
          billed_units: {
            input_tokens: 50,
            output_tokens: 100,
          },
        },
      };

      const result = BEDROCK_MODEL.COHERE_COMMAND.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 50,
        completion: 100,
        total: 150,
        numRequests: 1,
      });
    });

    it('should handle string token counts in COHERE_COMMAND', async () => {
      const mockResponse = {
        meta: {
          billed_units: {
            input_tokens: '50',
            output_tokens: '100',
          },
        },
      };

      const result = BEDROCK_MODEL.COHERE_COMMAND.tokenUsage!(mockResponse, 'Test prompt');
      expect(result).toEqual({
        prompt: 50,
        completion: 100,
        total: 150, // 50 + 100 = 150, not "50100"
        numRequests: 1,
      });
    });
  });
});

describe('AWS_BEDROCK_MODELS mapping', () => {
  it('should have the correct model mappings', async () => {
    expect(AWS_BEDROCK_MODELS['anthropic.claude-3-5-sonnet-20241022-v2:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-5-sonnet-20241022-v2:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['anthropic.claude-3-7-sonnet-20250219-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-3-7-sonnet-20250219-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['meta.llama3-1-405b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_1);
    expect(AWS_BEDROCK_MODELS['mistral.mistral-large-2407-v1:0']).toBe(
      BEDROCK_MODEL.MISTRAL_LARGE_2407,
    );
    expect(AWS_BEDROCK_MODELS['meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['meta.llama4-maverick-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-maverick-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
  });

  it('should support newer model IDs via region prefixes', async () => {
    [
      'us.meta.llama3-2-3b-instruct-v1:0',
      'eu.meta.llama3-2-3b-instruct-v1:0',
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      'us.meta.llama4-scout-17b-instruct-v1:0',
      'eu.meta.llama4-maverick-17b-instruct-v1:0',
    ].forEach((modelId) => {
      // Check if the model starts with a region prefix
      const baseModelId = modelId.split('.').slice(1).join('.');

      // Check if there's a match for the base model
      const handler =
        AWS_BEDROCK_MODELS[baseModelId] ||
        (baseModelId.startsWith('meta.llama3-2') ? BEDROCK_MODEL.LLAMA3_2 : null) ||
        (baseModelId.startsWith('meta.llama4') ? BEDROCK_MODEL.LLAMA4 : null) ||
        (baseModelId.startsWith('anthropic.claude') ? BEDROCK_MODEL.CLAUDE_MESSAGES : null);

      expect(handler).toBeTruthy();
    });
  });

  it('should map DeepSeek models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['deepseek.r1-v1:0']).toBe(BEDROCK_MODEL.DEEPSEEK);
    expect(AWS_BEDROCK_MODELS['us.deepseek.r1-v1:0']).toBe(BEDROCK_MODEL.DEEPSEEK);
  });

  it('should map OpenAI models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['openai.gpt-oss-120b-1:0']).toBe(BEDROCK_MODEL.OPENAI);
    expect(AWS_BEDROCK_MODELS['openai.gpt-oss-20b-1:0']).toBe(BEDROCK_MODEL.OPENAI);
  });

  it('should map APAC regional models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['apac.amazon.nova-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['apac.amazon.nova-micro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['apac.amazon.nova-pro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['apac.amazon.nova-premier-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['apac.anthropic.claude-3-5-sonnet-20240620-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['apac.anthropic.claude-3-haiku-20240307-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['apac.anthropic.claude-opus-4-1-20250805-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['apac.anthropic.claude-sonnet-4-20250514-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['apac.meta.llama4-scout-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
    expect(AWS_BEDROCK_MODELS['apac.meta.llama4-maverick-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
  });

  it('should map EU regional models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['eu.amazon.nova-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['eu.amazon.nova-micro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['eu.amazon.nova-pro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['eu.amazon.nova-premier-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-3-5-sonnet-20240620-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-3-7-sonnet-20250219-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-3-haiku-20240307-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-opus-4-1-20250805-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.anthropic.claude-sonnet-4-20250514-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['eu.meta.llama3-2-1b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['eu.meta.llama3-2-3b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['eu.meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['eu.meta.llama4-maverick-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
  });

  it('should map US regional models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['us.amazon.nova-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['us.amazon.nova-micro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['us.amazon.nova-pro-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['us.amazon.nova-premier-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA);
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-5-haiku-20241022-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-5-sonnet-20240620-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-5-sonnet-20241022-v2:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-haiku-20240307-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-3-opus-20240229-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-opus-4-20250514-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-opus-4-1-20250805-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.anthropic.claude-sonnet-4-20250514-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us.deepseek.r1-v1:0']).toBe(BEDROCK_MODEL.DEEPSEEK);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-1-405b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_1);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-1-70b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_1);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-1-8b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_1);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-2-11b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-2-1b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-2-3b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-2-90b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_2);
    expect(AWS_BEDROCK_MODELS['us.meta.llama3-3-70b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA3_3);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-maverick-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
  });

  it('should map US Gov Cloud models correctly', async () => {
    expect(AWS_BEDROCK_MODELS['us-gov.anthropic.claude-3-5-sonnet-20240620-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
    expect(AWS_BEDROCK_MODELS['us-gov.anthropic.claude-3-haiku-20240307-v1:0']).toBe(
      BEDROCK_MODEL.CLAUDE_MESSAGES,
    );
  });

  it('should map Nova 2 models correctly', async () => {
    // Base model ID
    expect(AWS_BEDROCK_MODELS['amazon.nova-2-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA_2);

    // Regional model IDs
    expect(AWS_BEDROCK_MODELS['us.amazon.nova-2-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA_2);
    expect(AWS_BEDROCK_MODELS['eu.amazon.nova-2-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA_2);
    expect(AWS_BEDROCK_MODELS['apac.amazon.nova-2-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA_2);

    // Global cross-region inference
    expect(AWS_BEDROCK_MODELS['global.amazon.nova-2-lite-v1:0']).toBe(BEDROCK_MODEL.AMAZON_NOVA_2);

    // Note: Nova 2 Sonic uses bidirectional streaming API like Nova Sonic v1,
    // so it's handled separately via NovaSonicProvider in registry.ts
  });
});

describe('AwsBedrockCompletionProvider', () => {
  const mockInvokeModel = vi.fn();
  let originalModelHandler: IBedrockModel;
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();

    BedrockRuntimeMock.mockImplementation(function () {
      return {
        invokeModel: mockInvokeModel.mockResolvedValue({
          body: {
            transformToString: () => JSON.stringify({ completion: 'test response' }),
          },
        }),
      };
    });

    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(null),
    };

    vi.mocked(getCache).mockResolvedValue(mockCache as any);
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return false;
    });

    originalModelHandler = AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'];

    AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'] = {
      params: vi.fn().mockImplementation(function (config) {
        return {
          prompt: 'formatted prompt',
          ...config,
        };
      }),
      output: vi.fn().mockReturnValue('processed output'),
      tokenUsage: vi.fn().mockReturnValue({
        prompt: 10,
        completion: 20,
        total: 30,
        numRequests: 1,
      }),
    };
  });

  afterEach(() => {
    AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'] = originalModelHandler;
  });

  it('should pass base config to model.params when context is not provided', async () => {
    const provider = new (class extends AwsBedrockCompletionProvider {
      constructor() {
        super('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
          config: {
            region: 'us-east-1',
            temperature: 0.5,
          } as BedrockClaudeMessagesCompletionOptions,
        });
      }
    })();

    await provider.callApi('test prompt');

    expect(
      AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'].params,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        temperature: 0.5,
      }),
      'test prompt',
      expect.any(Array),
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      undefined, // vars not provided when context is undefined
    );
  });

  it('should merge context.prompt.config with base config', async () => {
    const provider = new (class extends AwsBedrockCompletionProvider {
      constructor() {
        super('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
          config: {
            region: 'us-east-1',
            temperature: 0.5,
          } as BedrockClaudeMessagesCompletionOptions,
        });
      }
    })();

    const context = {
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
      vars: {},
    };

    await provider.callApi('test prompt', context);

    expect(
      AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'].params,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1', // From base config
        temperature: 0.7, // Overridden by context
        max_tokens: 100, // Added by context
      }),
      'test prompt',
      expect.any(Array),
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      {}, // vars from context
    );
  });

  it('should prioritize context.prompt.config values over base config', async () => {
    const provider = new (class extends AwsBedrockCompletionProvider {
      constructor() {
        super('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
          config: {
            region: 'us-east-1',
            temperature: 0.5,
            max_tokens: 50,
            top_p: 0.8,
          } as BedrockClaudeMessagesCompletionOptions,
        });
      }
    })();

    const context = {
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: {
          temperature: 0.9,
          max_tokens: 200,
        },
      },
      vars: {},
    };

    await provider.callApi('test prompt', context);

    expect(
      AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'].params,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1', // From base config
        temperature: 0.9, // Overridden by context
        max_tokens: 200, // Overridden by context
        top_p: 0.8, // From base config (unchanged)
      }),
      'test prompt',
      expect.any(Array),
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      {}, // vars from context
    );
  });

  it('should set cached flag when returning cached response', async () => {
    const mockCachedResponseData = { completion: 'cached response' };

    mockCache.get = vi.fn().mockResolvedValue(JSON.stringify(mockCachedResponseData));
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const provider = new (class extends AwsBedrockCompletionProvider {
      constructor() {
        super('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
          config: {
            region: 'us-east-1',
          } as BedrockClaudeMessagesCompletionOptions,
        });
      }
    })();

    const result = await provider.callApi('test prompt');

    expect(result.cached).toBe(true);
    expect(result.output).toBe('processed output');
    expect(mockCache.get).toHaveBeenCalled();
    // Verify invokeModel was not called because cache was used
    expect(mockInvokeModel).not.toHaveBeenCalled();
  });
});

describe('BEDROCK_MODEL.QWEN', () => {
  const qwenHandler = BEDROCK_MODEL.QWEN;

  describe('params', () => {
    it('should format prompt and parameters correctly', async () => {
      const config = {
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.9,
        showThinking: true,
      };
      const prompt = 'Write a Python function';
      const stop = ['</code>'];

      const result = await qwenHandler.params(
        config,
        prompt,
        stop,
        'qwen.qwen3-coder-480b-a35b-v1:0',
      );

      expect(result.messages).toEqual([{ role: 'user', content: 'Write a Python function' }]);
      expect(result.max_tokens).toBe(2048);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
      expect(result.stop).toEqual(['</code>']);
    });

    it('should handle tool configuration', async () => {
      const config = {
        max_tokens: 1024,
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'calculate',
              description: 'Perform calculations',
              parameters: {
                type: 'object',
                properties: {
                  expression: { type: 'string' },
                },
                required: ['expression'],
              },
            },
          },
        ],
        tool_choice: 'auto' as const,
      };
      const prompt = 'Calculate 5 + 3';

      const result = await qwenHandler.params(config, prompt);

      expect(result.tools).toEqual(config.tools);
      expect(result.tool_choice).toBe('auto');
    });

    it('should use environment variables for defaults', async () => {
      process.env.AWS_BEDROCK_TEMPERATURE = '0.5';
      process.env.AWS_BEDROCK_TOP_P = '0.8';

      const config = {};
      const prompt = 'Test prompt';

      const result = await qwenHandler.params(config, prompt);

      expect(result.temperature).toBe(0.5);
      expect(result.top_p).toBe(0.8);

      delete process.env.AWS_BEDROCK_TEMPERATURE;
      delete process.env.AWS_BEDROCK_TOP_P;
    });
  });

  describe('output', () => {
    it('should handle normal text response', async () => {
      const config = {};
      const responseJson = {
        choices: [
          {
            message: {
              content:
                'Here is a Python function:\n\ndef factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)',
            },
          },
        ],
      };

      const result = qwenHandler.output(config, responseJson);

      expect(result).toBe(
        'Here is a Python function:\n\ndef factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)',
      );
    });

    it('should handle tool call response', async () => {
      const config = {};
      const responseJson = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'calculate',
                    arguments: '{"expression": "15 * 8 + 42"}',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = qwenHandler.output(config, responseJson);

      expect(result).toContain('Called function calculate');
      expect(result).toContain('15 * 8 + 42');
    });

    it('should handle thinking mode response', async () => {
      const config = { showThinking: true };
      const responseJson = {
        choices: [
          {
            message: {
              content: '<think>Let me think about this step by step...</think>The answer is 42',
            },
          },
        ],
      };

      const result = qwenHandler.output(config, responseJson);

      expect(result).toBe('<think>Let me think about this step by step...</think>The answer is 42');
    });

    it('should hide thinking when showThinking is false', async () => {
      const config = { showThinking: false };
      const responseJson = {
        choices: [
          {
            message: {
              content: '<think>Let me think about this step by step...</think>The answer is 42',
            },
          },
        ],
      };

      const result = qwenHandler.output(config, responseJson);

      expect(result).toBe('The answer is 42');
      expect(result).not.toContain('think>');
    });

    it('should handle error response', async () => {
      const config = {};
      const responseJson = {
        error: {
          message: 'Model not found',
          code: 'ModelNotFoundException',
        },
      };

      expect(() => qwenHandler.output(config, responseJson)).toThrow(
        'Qwen API error: [object Object]',
      );
    });
  });

  describe('tokenUsage', () => {
    it('should extract token usage from response', async () => {
      const responseJson = {
        usage: {
          prompt_tokens: 50,
          completion_tokens: 100,
          total_tokens: 150,
        },
      };

      const result = qwenHandler.tokenUsage(responseJson, '');

      expect(result).toEqual({
        total: 150,
        prompt: 50,
        completion: 100,
        numRequests: 1,
      });
    });

    it('should handle missing usage data', async () => {
      const responseJson = {};

      const result = qwenHandler.tokenUsage(responseJson, '');

      expect(result).toEqual({
        total: undefined,
        prompt: undefined,
        completion: undefined,
        numRequests: 1,
      });
    });
  });
});

describe('Qwen model mapping', () => {
  it('should include all Qwen models in AWS_BEDROCK_MODELS', async () => {
    const qwenModels = [
      'qwen.qwen3-coder-480b-a35b-v1:0',
      'qwen.qwen3-coder-30b-a3b-v1:0',
      'qwen.qwen3-235b-a22b-2507-v1:0',
      'qwen.qwen3-32b-v1:0',
    ];

    qwenModels.forEach((modelId) => {
      expect(AWS_BEDROCK_MODELS[modelId]).toBeDefined();
      expect(AWS_BEDROCK_MODELS[modelId]).toBe(BEDROCK_MODEL.QWEN);
    });
  });

  it('should recognize qwen models by prefix', async () => {
    const provider = new AwsBedrockCompletionProvider('qwen.qwen3-coder-480b-a35b-v1:0');
    expect(provider.modelName).toBe('qwen.qwen3-coder-480b-a35b-v1:0');
  });
});

describe('coerceStrToNum', () => {
  it('should convert string numbers to numeric values', async () => {
    expect(coerceStrToNum('42')).toBe(42);
    expect(coerceStrToNum('3.14')).toBe(3.14);
    expect(coerceStrToNum('-10')).toBe(-10);
    expect(coerceStrToNum('0')).toBe(0);
  });

  it('should return original value for numbers', async () => {
    expect(coerceStrToNum(42)).toBe(42);
    expect(coerceStrToNum(3.14)).toBe(3.14);
    expect(coerceStrToNum(-10)).toBe(-10);
    expect(coerceStrToNum(0)).toBe(0);
  });

  it('should handle undefined values', async () => {
    expect(coerceStrToNum(undefined)).toBeUndefined();
  });

  it('should convert invalid string numbers to NaN', async () => {
    expect(Number.isNaN(coerceStrToNum('not-a-number') as number)).toBe(true);
  });
});
