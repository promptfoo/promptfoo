import dedent from 'dedent';
import {
  addConfigParam,
  AwsBedrockGenericProvider,
  formatPromptLlama2Chat,
  getLlamaModelHandler,
  LlamaMessage,
  LlamaVersion,
  parseValue,
} from '../src/providers/bedrock';

jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntime: jest.fn().mockImplementation(() => {
      return {
        invokeModel: jest.fn(),
      };
    }),
  };
});

jest.mock(
  '@smithy/node-http-handler',
  () => {
    return {
      NodeHttpHandler: jest.fn(),
    };
  },
  { virtual: true },
);

jest.mock('proxy-agent', () => jest.fn());

jest.mock('../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../src/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('AwsBedrockGenericProvider', () => {
  let BedrockRuntime;

  beforeEach(() => {
    jest.resetModules();
    BedrockRuntime = require('@aws-sdk/client-bedrock-runtime').BedrockRuntime;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
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

  it('should throw an error if NodeHttpHandler dependency is missing for proxy', async () => {
    process.env.HTTP_PROXY = 'http://localhost:8080';
    process.env.HTTPS_PROXY = 'https://localhost:8080';

    jest.doMock('@smithy/node-http-handler', () => {
      throw new Error('Missing dependency');
    });

    const provider = new (class extends AwsBedrockGenericProvider {
      constructor() {
        super('test-model', { config: { region: 'us-east-1' } });
      }
    })();

    await expect(provider.getBedrockInstance()).rejects.toThrow(
      'The @smithy/node-http-handler package is required as a peer dependency. Please install it in your project or globally.',
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
          prompt: `<s>[INST] Describe the purpose of a "hello world" program in one sentence. [/INST]`,
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
          temperature: 0.01,
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
          temperature: 0.01,
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
          temperature: 0.01,
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
          temperature: 0.01,
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
      const expectedPrompt =
        dedent`
      <s>[INST] <<SYS>>
      You are a helpful assistant.
      <</SYS>>

      ` + '\n\n';
      expect(formatPromptLlama2Chat(messages)).toBe(expectedPrompt);
    });
  });
});
