import dedent from 'dedent';
import type {
  BedrockAI21GenerationOptions,
  BedrockClaudeMessagesCompletionOptions,
  LlamaMessage,
  TextGenerationOptions,
} from '../../../src/providers/bedrock';
import {
  addConfigParam,
  AwsBedrockCompletionProvider,
  AwsBedrockGenericProvider,
  AWS_BEDROCK_MODELS,
  BEDROCK_MODEL,
  coerceStrToNum,
  formatPromptLlama2Chat,
  formatPromptLlama3Instruct,
  formatPromptLlama4,
  getLlamaModelHandler,
  LlamaVersion,
  parseValue,
} from '../../../src/providers/bedrock';
import type { IBedrockModel } from '../../../src/providers/bedrock';

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntime: jest.fn().mockImplementation(() => ({
    invokeModel: jest.fn(),
  })),
}));

const { BedrockRuntime } = jest.requireMock('@aws-sdk/client-bedrock-runtime');

jest.mock('@smithy/node-http-handler', () => {
  return {
    NodeHttpHandler: jest.fn(),
  };
});

// Preserve proxy variables so they can be restored after each test. These are
// set in the container environment and can influence proxy-related logic in the
// provider implementation.
const ORIGINAL_HTTP_PROXY = process.env.HTTP_PROXY;
const ORIGINAL_HTTPS_PROXY = process.env.HTTPS_PROXY;

jest.mock('proxy-agent', () => jest.fn());

jest.mock('../../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

class TestBedrockProvider extends AwsBedrockGenericProvider {
  modelName = 'test-model';

  constructor(config: any = {}) {
    super('test-model', { config });
  }

  async getClient() {
    return this.getBedrockInstance();
  }

  async generateText(prompt: string, options?: TextGenerationOptions): Promise<string> {
    return '';
  }

  async generateChat(messages: any[], options?: any): Promise<any> {
    return {};
  }
}

describe('AwsBedrockGenericProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AWS_BEDROCK_MAX_RETRIES;
    // Ensure proxy environment variables do not force proxy-specific code paths
    // when running tests. The container sets HTTP_PROXY by default which causes
    // getBedrockInstance to require optional dependencies that are not
    // installed in the test environment.
    process.env.HTTP_PROXY = '';
    process.env.HTTPS_PROXY = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    expect(BedrockRuntime).toHaveBeenCalledWith({
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

    expect(BedrockRuntime).toHaveBeenCalledWith({
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

    expect(BedrockRuntime).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
    expect(BedrockRuntime).not.toHaveBeenCalledWith(
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

    expect(BedrockRuntime).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
  });

  describe('BEDROCK_MODEL CLAUDE_MESSAGES', () => {
    const modelHandler = BEDROCK_MODEL.CLAUDE_MESSAGES;

    it('should include tools and tool_choice in params when provided', () => {
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

      const params = modelHandler.params(config, 'Test prompt');

      expect(params).toHaveProperty('tools');
      expect(params.tools).toHaveLength(1);
      expect(params.tools[0]).toHaveProperty('name', 'get_current_weather');
      expect(params).toHaveProperty('tool_choice');
      expect(params.tool_choice).toEqual({ type: 'auto' });
    });

    it('should not include tools and tool_choice in params when not provided', () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      const params = modelHandler.params(config, 'Test prompt');

      expect(params).not.toHaveProperty('tools');
      expect(params).not.toHaveProperty('tool_choice');
    });

    it('should include specific tool_choice when provided', () => {
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

      const params = modelHandler.params(config, 'Test prompt');

      expect(params).toHaveProperty('tool_choice');
      expect(params.tool_choice).toEqual({ type: 'tool', name: 'get_current_weather' });
    });

    it('should handle JSON message array with image content', () => {
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

      const params = BEDROCK_MODEL.CLAUDE_MESSAGES.params(config, prompt);

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

    it('should handle JSON message array with system message and image content', () => {
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

      const params = BEDROCK_MODEL.CLAUDE_MESSAGES.params(config, prompt);

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

    it('should convert lone system message to user message', () => {
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
      };

      // Test with string content
      const promptWithStringContent = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
      ]);
      const paramsWithString = modelHandler.params(config, promptWithStringContent);
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
      const paramsWithArray = modelHandler.params(config, promptWithArrayContent);
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

    it('should include AI21-specific parameters', () => {
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
      const params = modelHandler.params(config, prompt);

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

    it('should use default values when config is not provided', () => {
      const config = {};
      const prompt = 'Tell me a joke.';

      const params = modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        top_p: 1.0,
      });
    });

    it('should handle output correctly', () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is a test response.' } }],
      };
      expect(modelHandler.output({}, mockResponse)).toBe('This is a test response.');
    });

    it('should throw an error for API errors', () => {
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
      const mockSSOProvider = jest.fn();
      jest.mock('@aws-sdk/credential-provider-sso', () => ({
        fromSSO: (config: any) => {
          mockSSOProvider();
          expect(config).toEqual({ profile: 'test-profile' });
          return 'sso-provider';
        },
      }));

      const provider = new TestBedrockProvider({
        profile: 'test-profile',
      });

      const credentials = await provider.getCredentials();
      expect(mockSSOProvider).toHaveBeenCalledWith();
      expect(credentials).toBe('sso-provider');
    });

    it('should return undefined when no credentials are provided', async () => {
      const provider = new TestBedrockProvider({});
      const credentials = await provider.getCredentials();
      expect(credentials).toBeUndefined();
    });
  });
});

describe('addConfigParam', () => {
  it('should add config value if provided', () => {
    const params: any = {};
    addConfigParam(params, 'key', 'configValue');
    expect(params.key).toBe('configValue');
  });

  it('should add env value if config value is not provided', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY);
    expect(params.key).toBe('envValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should add default value if neither config nor env value is provided', () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, undefined, 'defaultValue');
    expect(params.key).toBe('defaultValue');
  });

  it('should prioritize config value over env and default values', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', 'configValue', process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('configValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should prioritize env value over default value if config value is not provided', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'envValue';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('envValue');
    delete process.env.TEST_ENV_KEY;
  });

  it('should parse env value if default value is a number', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '42';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 0);
    expect(params.key).toBe(42);
    delete process.env.TEST_ENV_KEY;
  });

  it('should handle undefined config, env, and default values gracefully', () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, undefined, undefined);
    expect(params.key).toBeUndefined();
  });

  it('should correctly parse non-number string values', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = 'nonNumberString';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 0);
    expect(params.key).toBe(0);
    delete process.env.TEST_ENV_KEY;
  });

  it('should correctly parse empty string values', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('');
    delete process.env.TEST_ENV_KEY;
  });

  it('should handle env value not set', () => {
    const params: any = {};
    addConfigParam(params, 'key', undefined, process.env.UNSET_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('defaultValue');
  });

  it('should handle config values that are objects', () => {
    const params: any = {};
    const configValue = { nestedKey: 'nestedValue' };
    addConfigParam(params, 'key', configValue);
    expect(params.key).toEqual(configValue);
  });

  it('should handle config values that are arrays', () => {
    const params: any = {};
    const configValue = ['value1', 'value2'];
    addConfigParam(params, 'key', configValue);
    expect(params.key).toEqual(configValue);
  });

  it('should handle special characters in env values', () => {
    const params: any = {};
    process.env.TEST_ENV_KEY = '!@#$%^&*()_+';
    addConfigParam(params, 'key', undefined, process.env.TEST_ENV_KEY, 'defaultValue');
    expect(params.key).toBe('!@#$%^&*()_+');
    delete process.env.TEST_ENV_KEY;
  });
});

describe('parseValue', () => {
  it('should return the original value if defaultValue is not a number', () => {
    expect(parseValue('stringValue', 'defaultValue')).toBe('stringValue');
  });

  it('should return parsed float value if defaultValue is a number', () => {
    expect(parseValue('42.5', 0)).toBe(42.5);
  });

  it('should return NaN for non-numeric strings if defaultValue is a number', () => {
    expect(parseValue('notANumber', 0)).toBe(0);
  });

  it('should return 0 for an empty string if defaultValue is a number', () => {
    expect(parseValue('', 0)).toBe(0);
  });

  it('should return null for a null value if defaultValue is not a number', () => {
    expect(parseValue(null as never, 'defaultValue')).toBeNull();
  });

  it('should return undefined for an undefined value if defaultValue is not a number', () => {
    expect(parseValue(undefined as never, 'defaultValue')).toBeUndefined();
  });
});

describe('llama', () => {
  describe('getLlamaModelHandler', () => {
    describe('LLAMA2', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V2);

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: `<s>[INST] Describe the purpose of a \"hello world\" program in one sentence. [/INST]`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<s>[INST] <<SYS>>
        You are a helpful assistant.
        <</SYS>>

        What is the capital of France? [/INST]`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        expect(handler.params(config, prompt)).toEqual({
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

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>system<|end_header_id|>

        You are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>

        What is the capital of France?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        expect(handler.params(config, prompt)).toEqual({
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

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
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

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should use max_gen_len parameter', () => {
        const config = { max_gen_len: 1000 };
        const prompt = 'Test prompt';
        const params = handler.params(config, prompt);
        expect(params).toHaveProperty('max_gen_len', 1000);
      });
    });

    describe('LLAMA3_3', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V3_3);

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should use max_gen_len parameter', () => {
        const config = { max_gen_len: 1000 };
        const prompt = 'Test prompt';
        const params = handler.params(config, prompt);
        expect(params).toHaveProperty('max_gen_len', 1000);
      });
    });

    describe('LLAMA4', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V4);

      it('should generate correct prompt for a single user message', () => {
        const config = { temperature: 0.5, top_p: 0.9, max_gen_len: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Describe the purpose of a "hello world" program in one sentence.<|eot|><|header_start|>assistant<|header_end|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_gen_len: 512,
        });
      });

      it('should handle a system message followed by a user message', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ]);
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|header_start|>system<|header_end|>

You are a helpful assistant.<|eot|><|header_start|>user<|header_end|>

What is the capital of France?<|eot|><|header_start|>assistant<|header_end|>`,
          temperature: 0,
          top_p: 1,
          max_gen_len: 1024,
        });
      });

      it('should handle multiple turns of conversation', () => {
        const config = {};
        const prompt = JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there! How can I assist you today?' },
          { role: 'user', content: "What's the weather like?" },
        ]);
        expect(handler.params(config, prompt)).toEqual({
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

    it('should throw an error for unsupported LLAMA version', () => {
      expect(() => getLlamaModelHandler(1 as LlamaVersion)).toThrow('Unsupported LLAMA version: 1');
    });

    it('should handle output correctly', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V2);
      expect(handler.output({}, { generation: 'Test response' })).toBe('Test response');
      expect(handler.output({}, {})).toBeUndefined();
    });
  });

  describe('formatPromptLlama2Chat', () => {
    it('should format a single user message correctly', () => {
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

    it('should handle a system message followed by a user message', () => {
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

    it('should handle a system message, user message, and assistant response', () => {
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

    it('should handle multiple turns of conversation', () => {
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

    it('should handle only a system message correctly', () => {
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
    it('should format a single user message correctly', () => {
      const messages: LlamaMessage[] = [{ role: 'user', content: 'Hello, how are you?' }];
      const expected = dedent`
        <|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Hello, how are you?<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
      expect(formatPromptLlama3Instruct(messages)).toBe(expected);
    });

    it('should format multiple messages correctly', () => {
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

    it('should handle system messages correctly', () => {
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
    it('should format a single user message correctly', () => {
      const messages: LlamaMessage[] = [{ role: 'user', content: 'Hello, how are you?' }];
      const expected = dedent`<|begin_of_text|><|header_start|>user<|header_end|>

Hello, how are you?<|eot|><|header_start|>assistant<|header_end|>`;
      expect(formatPromptLlama4(messages)).toBe(expected);
    });

    it('should format multiple messages correctly', () => {
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

    it('should handle system messages correctly', () => {
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
});

describe('BEDROCK_MODEL AMAZON_NOVA', () => {
  const modelHandler = BEDROCK_MODEL.AMAZON_NOVA;

  it('should format system message correctly when using JSON array input', () => {
    const config = {};
    const prompt = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ]);

    const params = modelHandler.params(config, prompt);

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

  it('should handle messages without system prompt', () => {
    const config = {};
    const prompt = JSON.stringify([
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ]);

    const params = modelHandler.params(config, prompt);

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

  it('should handle complex message content arrays', () => {
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

    const params = modelHandler.params(config, prompt);

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

  it('should handle invalid JSON gracefully', () => {
    const config = {};
    const prompt = 'Invalid JSON';

    const params = modelHandler.params(config, prompt);

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
    it('should include Mistral-specific parameters', () => {
      const config = {
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
      };
      const prompt = 'What is the capital of France?';
      const stop = ['END'];

      const params = modelHandler.params(config, prompt, stop);

      expect(params).toEqual({
        prompt,
        stop,
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
      });
    });

    it('should use default values when config is not provided', () => {
      const config = {};
      const prompt = 'Hello, how are you?';
      const stop: string[] = [];

      const params = modelHandler.params(config, prompt, stop);

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
    it('should extract output from outputs[0].text format', () => {
      const mockResponse = {
        outputs: [{ text: 'This is a test response.' }],
      };

      expect(modelHandler.output({}, mockResponse)).toBe('This is a test response.');
    });

    it('should return undefined for unrecognized formats', () => {
      const mockResponse = { something: 'else' };

      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should use explicit token usage when available', () => {
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

    it('should return undefined token counts when not provided by the API', () => {
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

describe('BEDROCK_MODEL MISTRAL_LARGE_2407', () => {
  const modelHandler = BEDROCK_MODEL.MISTRAL_LARGE_2407;

  describe('params', () => {
    it('should include Mistral-specific parameters without top_k', () => {
      const config = {
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50, // This should be ignored
      };
      const prompt = 'What is the capital of France?';
      const stop = ['END'];

      const params = modelHandler.params(config, prompt, stop);

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

    it('should use default values when config is not provided', () => {
      const config = {};
      const prompt = 'Hello, how are you?';
      const stop: string[] = [];

      const params = modelHandler.params(config, prompt, stop);

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
    it('should extract output from chat completion format', () => {
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

    it('should return undefined for unrecognized formats', () => {
      const mockResponse = { something: 'else' };

      const result = modelHandler.output({}, mockResponse);
      expect(result).toBeUndefined();
    });
  });

  describe('tokenUsage', () => {
    it('should extract token usage from chat completion format', () => {
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

    it('should return undefined token counts when not provided by the API', () => {
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

describe('BEDROCK_MODEL token counting functionality', () => {
  describe('MISTRAL model handler', () => {
    const modelHandler = BEDROCK_MODEL.MISTRAL;

    it('should extract token usage from API response when available', () => {
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

    it('should handle string token counts', () => {
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

    it('should return undefined token counts when not provided by the API', () => {
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

    it('should extract token usage from chat completion format', () => {
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

    it('should handle string token counts', () => {
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

    it('should return undefined token counts when not provided by the API', () => {
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
    it('should extract token usage from Llama response', () => {
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

    it('should handle string token counts', () => {
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
    it('should handle new-style token fields in Claude Messages', () => {
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

    it('should handle string token counts in Claude Messages', () => {
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

    it('should handle old-style token fields in Claude Completion', () => {
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

    it('should handle string token counts in Claude Completion', () => {
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
    it('should handle numeric token counts', () => {
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

    it('should handle string token counts', () => {
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
    it('should handle numeric token counts in COHERE_COMMAND', () => {
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

    it('should handle string token counts in COHERE_COMMAND', () => {
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
  it('should include mistral.mistral-large-2407-v1:0', () => {
    expect(AWS_BEDROCK_MODELS['mistral.mistral-large-2407-v1:0']).toBe(
      BEDROCK_MODEL.MISTRAL_LARGE_2407,
    );
  });

  it('should include Llama 4 models with appropriate handlers', () => {
    expect(AWS_BEDROCK_MODELS['meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['meta.llama4-maverick-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-scout-17b-instruct-v1:0']).toBe(BEDROCK_MODEL.LLAMA4);
    expect(AWS_BEDROCK_MODELS['us.meta.llama4-maverick-17b-instruct-v1:0']).toBe(
      BEDROCK_MODEL.LLAMA4,
    );
  });

  it('should support newer model IDs via region prefixes', () => {
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

  it('should handle mistral models via startsWith fallback', () => {
    const newMistralModel = 'mistral.some-future-model-v1:0';

    // This simulates the logic in getHandlerForModel
    let handler = AWS_BEDROCK_MODELS[newMistralModel];
    if (!handler && newMistralModel.startsWith('mistral.')) {
      handler = BEDROCK_MODEL.MISTRAL;
    }

    expect(handler).toBe(BEDROCK_MODEL.MISTRAL);
  });

  it('should handle llama4 models via includes fallback', () => {
    const newLlama4Model = 'meta.llama4-future-model-v1:0';

    // This simulates the logic in getHandlerForModel
    let handler = AWS_BEDROCK_MODELS[newLlama4Model];
    if (!handler && newLlama4Model.includes('meta.llama4')) {
      handler = BEDROCK_MODEL.LLAMA4;
    }

    expect(handler).toBe(BEDROCK_MODEL.LLAMA4);
  });
});

describe('AwsBedrockCompletionProvider', () => {
  const { BedrockRuntime } = jest.requireMock('@aws-sdk/client-bedrock-runtime');
  const mockInvokeModel = jest.fn();
  let originalModelHandler: IBedrockModel;
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();

    BedrockRuntime.mockImplementation(() => ({
      invokeModel: mockInvokeModel.mockResolvedValue({
        body: {
          transformToString: () => JSON.stringify({ completion: 'test response' }),
        },
      }),
    }));

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(null),
    };

    const { getCache, isCacheEnabled } = jest.requireMock('../../../src/cache');
    getCache.mockResolvedValue(mockCache);
    isCacheEnabled.mockReturnValue(false);

    originalModelHandler = AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'];

    AWS_BEDROCK_MODELS['us.anthropic.claude-3-7-sonnet-20250219-v1:0'] = {
      params: jest.fn().mockImplementation((config) => ({
        prompt: 'formatted prompt',
        ...config,
      })),
      output: jest.fn().mockReturnValue('processed output'),
      tokenUsage: jest.fn().mockReturnValue({
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
    );
  });
});

describe('coerceStrToNum', () => {
  it('should convert string numbers to numeric values', () => {
    expect(coerceStrToNum('42')).toBe(42);
    expect(coerceStrToNum('3.14')).toBe(3.14);
    expect(coerceStrToNum('-10')).toBe(-10);
    expect(coerceStrToNum('0')).toBe(0);
  });

  it('should return original value for numbers', () => {
    expect(coerceStrToNum(42)).toBe(42);
    expect(coerceStrToNum(3.14)).toBe(3.14);
    expect(coerceStrToNum(-10)).toBe(-10);
    expect(coerceStrToNum(0)).toBe(0);
  });

  it('should handle undefined values', () => {
    expect(coerceStrToNum(undefined)).toBeUndefined();
  });

  it('should convert invalid string numbers to NaN', () => {
    expect(Number.isNaN(coerceStrToNum('not-a-number') as number)).toBe(true);
  });
});
