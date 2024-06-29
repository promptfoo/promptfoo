import dedent from 'dedent';
import { addConfigParam, AwsBedrockGenericProvider, getLlamaModelHandler, parseValue } from '../src/providers/bedrock';

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

describe('getLlamaModelHandler', () => {
  describe('LLAMA2', () => {
    it('should generate correct prompt for LLAMA2', () => {
      const config = {
        temperature: 0.5,
        top_p: 0.9,
        max_gen_len: 512,
      };
      const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
      expect(getLlamaModelHandler(2).params(config, prompt)).toEqual({
        prompt: `<s>[INST] Describe the purpose of a \"hello world\" program in one sentence. [/INST]`,
        temperature: 0.5,
        top_p: 0.9,
        max_gen_len: 512
      });
    });
  });

  describe('LLAMA3', () => {
    it('should generate correct prompt for LLAMA3', () => {
      const config = {
        temperature: 0.5,
        top_p: 0.9,
        max_gen_len: 512,
      };
      const prompt = 'Describe the purpose of a "hello world" program in one sentence.';
      expect(getLlamaModelHandler(3).params(config, prompt)).toEqual({
        prompt: dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

        Describe the purpose of a "hello world" program in one sentence.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
        temperature: 0.5,
        top_p: 0.9,
        max_gen_len: 512
      });
    });
  });
});
