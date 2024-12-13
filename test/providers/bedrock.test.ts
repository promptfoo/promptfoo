import dedent from 'dedent';
import type {
  BedrockAI21GenerationOptions,
  BedrockClaudeMessagesCompletionOptions,
  LlamaMessage,
  TextGenerationOptions,
} from '../../src/providers/bedrock';
import {
  AwsBedrockGenericProvider,
  BedrockKnowledgeBaseProvider,
} from '../../src/providers/bedrock';
import {
  addConfigParam,
  BEDROCK_MODEL,
  formatPromptLlama2Chat,
  formatPromptLlama3Instruct,
  getLlamaModelHandler,
  LlamaVersion,
  parseValue,
} from '../../src/providers/bedrock';

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntime: jest.fn().mockImplementation(() => ({
    invokeModel: jest.fn(),
  })),
}));

jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  RetrieveCommand: jest.fn(),
}));

const { BedrockRuntime } = jest.requireMock('@aws-sdk/client-bedrock-runtime');

jest.mock('@smithy/node-http-handler', () => {
  return {
    NodeHttpHandler: jest.fn(),
  };
});

jest.mock('proxy-agent', () => jest.fn());

jest.mock('../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    });
    expect(BedrockRuntime).not.toHaveBeenCalledWith(
      expect.objectContaining({ credentials: expect.anything() }),
    );
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
      const config: BedrockAI21GenerationOptions = { region: 'us-east-1' };
      const prompt = 'Tell me a joke.';
      const params = modelHandler.params(config, prompt);

      expect(params).toEqual({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0,
        top_p: 1.0,
      });
    });

    it('should handle output correctly', () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is a test response.' } }],
      };
      expect(modelHandler.output(mockResponse)).toBe('This is a test response.');
    });

    it('should throw an error for API errors', () => {
      const mockErrorResponse = { error: 'API Error' };
      expect(() => modelHandler.output(mockErrorResponse)).toThrow('AI21 API error: API Error');
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

describe('BedrockKnowledgeBaseProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct provider ID format', () => {
    const provider = new BedrockKnowledgeBaseProvider('test-kb-id');
    expect(provider.toString()).toBe('[Amazon Bedrock Provider bedrock:knowledge-base:test-kb-id]');
  });

  it('should handle successful knowledge base query', async () => {
    const mockResponse = {
      retrievalResults: [
        {
          content: {
            text: 'Test response 1',
          },
        },
        {
          content: {
            text: 'Test response 2',
          },
        },
      ],
    };

    jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
      BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue(mockResponse),
      })),
      RetrieveCommand: jest.fn(),
    }));

    const provider = new BedrockKnowledgeBaseProvider('test-kb-id');
    const response = await provider.callApi('What is AWS?');

    expect(response.output).toBe('Test response 1\nTest response 2');
    expect(response.error).toBeUndefined();
  });

  it('should handle empty response', async () => {
    const mockResponse = {
      retrievalResults: [],
    };

    const { BedrockAgentRuntimeClient, RetrieveCommand } = jest.requireMock(
      '@aws-sdk/client-bedrock-agent-runtime',
    );
    BedrockAgentRuntimeClient.mockImplementation(() => ({
      send: jest.fn().mockResolvedValue(mockResponse),
    }));
    RetrieveCommand.mockImplementation(() => ({
      // Mock implementation
    }));

    const provider = new BedrockKnowledgeBaseProvider('test-kb-id');
    const response = await provider.callApi('What is AWS?');

    expect(response.output).toBe('');
    expect(response.error).toBeUndefined();
    expect(response.tokenUsage).toBeUndefined();
  });

  it('should handle API errors', async () => {
    const mockError = new Error('API error');

    const { BedrockAgentRuntimeClient, RetrieveCommand } = jest.requireMock(
      '@aws-sdk/client-bedrock-agent-runtime',
    );
    BedrockAgentRuntimeClient.mockImplementation(() => ({
      send: jest.fn().mockRejectedValue(mockError),
    }));
    RetrieveCommand.mockImplementation(() => ({
      // Mock implementation
    }));

    const provider = new BedrockKnowledgeBaseProvider('test-kb-id');
    const response = await provider.callApi('What is AWS?');

    expect(response.output).toBeUndefined();
    expect(response.error).toBe('Knowledge Base API call error: Error: API error');
  });

  it('should handle vector search configuration', async () => {
    const mockResponse = {
      retrievalResults: [
        {
          content: {
            text: 'Test response',
          },
        },
      ],
    };

    const mockSend = jest.fn().mockResolvedValue(mockResponse);
    const mockRetrieveCommand = jest.fn();

    const { BedrockAgentRuntimeClient, RetrieveCommand } = jest.requireMock(
      '@aws-sdk/client-bedrock-agent-runtime',
    );
    BedrockAgentRuntimeClient.mockImplementation(() => ({
      send: mockSend,
    }));
    RetrieveCommand.mockImplementation(
      (params: {
        knowledgeBaseId: string;
        retrievalQuery: { text: string };
        vectorSearchConfiguration?: { numberOfResults: number };
      }) => {
        mockRetrieveCommand(params);
        return {};
      },
    );

    const provider = new BedrockKnowledgeBaseProvider('test-kb-id', {
      config: {
        vectorSearchConfiguration: {
          numberOfResults: 5,
        },
      },
    });

    await provider.callApi('What is AWS?');

    expect(mockRetrieveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBaseId: 'test-kb-id',
        retrievalQuery: { text: 'What is AWS?' },
        vectorSearchConfiguration: {
          numberOfResults: 5,
        },
      }),
    );
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
        const config = { temperature: 0.5, top_p: 0.9, max_new_tokens: 512 };
        const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
        expect(handler.params(config, prompt)).toEqual({
          prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
          temperature: 0.5,
          top_p: 0.9,
          max_new_tokens: 512,
        });
      });

      it('should use max_new_tokens instead of max_gen_len', () => {
        const config = { max_new_tokens: 1000 };
        const prompt = 'Test prompt';
        const params = handler.params(config, prompt);
        expect(params).toHaveProperty('max_new_tokens', 1000);
        expect(params).not.toHaveProperty('max_gen_len');
      });
    });

    it('should throw an error for unsupported LLAMA version', () => {
      expect(() => getLlamaModelHandler(1 as LlamaVersion)).toThrow('Unsupported LLAMA version: 1');
    });

    it('should handle output correctly', () => {
      const handler = getLlamaModelHandler(LlamaVersion.V2);
      expect(handler.output({ generation: 'Test response' })).toBe('Test response');
      expect(handler.output({})).toBeUndefined();
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
});
