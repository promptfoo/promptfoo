import * as fs from 'fs';
import { createRequire } from 'node:module';
import * as path from 'path';
import { renderPrompt, resolveVariables, runExtensionHook } from '../src/evaluatorHelpers';
import type { Prompt } from '../src/types';
import { transform } from '../src/util/transform';
import { loadFile } from '../src/util/fileLoader';
import * as yaml from 'yaml';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: jest.fn().mockReturnValue(mockRequire),
  };
});

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
}));

// Mock yaml properly
jest.mock('yaml', () => ({
  parse: jest.fn().mockImplementation((content) => {
    if (content === 'key: valueFromYaml') {
      return { key: 'valueFromYaml' };
    }
    return {};
  }),
}));

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('renderPrompt', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    delete process.env.PROMPTFOO_DISABLE_JSON_AUTOESCAPE;
  });

  it('should render a prompt with a single variable', async () => {
    const prompt = toPrompt('Test prompt {{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('Test prompt value1');
  });

  it('should render nested variables in non-JSON prompts', async () => {
    const prompt = toPrompt('Test {{ outer[inner] }}');
    const renderedPrompt = await renderPrompt(
      prompt,
      { outer: { key1: 'value1' }, inner: 'key1' },
      {},
    );
    expect(renderedPrompt).toBe('Test value1');
  });

  it('should handle complex variable substitutions in non-JSON prompts', async () => {
    const prompt = toPrompt('{{ var1[var2] }}');
    const renderedPrompt = await renderPrompt(
      prompt,
      {
        var1: { hello: 'world' },
        var2: 'hello',
      },
      {},
    );
    expect(renderedPrompt).toBe('world');
  });

  it('should render a JSON prompt', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(JSON.parse('[{"text":"Test prompt "},{"text":"value1"}]'), null, 2),
    );
  });

  it('should render nested variables in JSON prompts', async () => {
    const prompt = toPrompt('{"text": "{{ outer[inner] }}"}');
    const renderedPrompt = await renderPrompt(
      prompt,
      { outer: { key1: 'value1' }, inner: 'key1' },
      {},
    );
    expect(renderedPrompt).toBe(JSON.stringify({ text: 'value1' }, null, 2));
  });

  it('should handle complex variable substitutions in JSON prompts', async () => {
    const prompt = toPrompt('{"message": "{{ var1[var2] }}"}');
    const renderedPrompt = await renderPrompt(
      prompt,
      {
        var1: { hello: 'world' },
        var2: 'hello',
      },
      {},
    );
    expect(renderedPrompt).toBe(JSON.stringify({ message: 'world' }, null, 2));
  });

  it('should render a JSON prompt and escape the var string', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'He said "hello world!"' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(
        JSON.parse('[{"text":"Test prompt "},{"text":"He said \\"hello world!\\""}]'),
        null,
        2,
      ),
    );
  });

  it('should render a JSON prompt with nested JSON', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: '{"nested": "value1"}' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(
        JSON.parse('[{"text":"Test prompt "},{"text":"{\\"nested\\": \\"value1\\"}"}]'),
        null,
        2,
      ),
    );
  });

  it('should load external yaml files in renderPrompt', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file://test.txt' };
    const evaluateOptions = {};

    jest.mocked(loadFile).mockResolvedValueOnce('loaded from file');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(loadFile).toHaveBeenCalledWith('test.txt');
    expect(renderedPrompt).toBe('Test prompt with loaded from file');
  });

  it('should load external js files in renderPrompt and execute the exported function', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }} {{ var2 }} {{ var3 }}');
    const vars = {
      var1: 'file:///path/to/testFunction.js',
      var2: 'file:///path/to/testFunction.cjs',
      var3: 'file:///path/to/testFunction.mjs',
    };
    const evaluateOptions = {};

    jest.doMock(
      path.resolve('/path/to/testFunction.js'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `Dynamic value for ${varName}` }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.cjs'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `and ${varName}` }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.mjs'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `and ${varName}` }),
      { virtual: true },
    );

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);
    expect(renderedPrompt).toBe('Test prompt with Dynamic value for var1 and var2 and var3');
  });

  it('should load external js package in renderPrompt and execute the exported function', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = {
      var1: 'package:@promptfoo/fake:testFunction',
    };
    const evaluateOptions = {};

    const require = createRequire('');
    jest.spyOn(require, 'resolve').mockReturnValueOnce('/node_modules/@promptfoo/fake/index.js');

    jest.doMock(
      path.resolve('/node_modules/@promptfoo/fake/index.js'),
      () => {
        return {
          testFunction: (varName: any, prompt: any, vars: any) => ({
            output: `Dynamic value for ${varName}`,
          }),
        };
      },
      { virtual: true },
    );

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);
    expect(renderedPrompt).toBe('Test prompt with Dynamic value for var1');
  });

  it('should load external json files in renderPrompt and parse the JSON content', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file:///path/to/testData.json' };
    const evaluateOptions = {};

    // Mock loadFile to return a JSON string
    jest.mocked(loadFile).mockResolvedValueOnce('{"key":"valueFromJson"}');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(loadFile).toHaveBeenCalledWith('/path/to/testData.json');
    // When an object is interpolated in a Nunjucks template, it uses toString() which results in [object Object]
    expect(renderedPrompt).toBe('Test prompt with [object Object]');
  });

  it('should load external yaml files in renderPrompt and parse the YAML content', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file:///path/to/testData.yaml' };
    const evaluateOptions = {};

    // Mock loadFile to return YAML content
    jest.mocked(loadFile).mockResolvedValueOnce('key: valueFromYaml');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(loadFile).toHaveBeenCalledWith('/path/to/testData.yaml');
    // When an object is interpolated in a Nunjucks template, it uses toString() which results in [object Object]
    expect(renderedPrompt).toBe('Test prompt with [object Object]');
  });

  describe('with PROMPTFOO_DISABLE_TEMPLATING', () => {
    beforeEach(() => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    });

    afterEach(() => {
      delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    });

    it('should return raw prompt when templating is disabled', async () => {
      const prompt = toPrompt('Test prompt {{ var1 }}');
      const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
      expect(renderedPrompt).toBe('Test prompt {{ var1 }}');
    });
  });

  it('should render normally when templating is enabled', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'false';
    const prompt = toPrompt('Test prompt {{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('Test prompt value1');
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });
});

describe('renderPrompt with prompt functions', () => {
  it('should handle string returns from prompt functions', async () => {
    const promptObj = {
      ...toPrompt('test'),
      function: async () => 'Hello, world!',
    };
    const result = await renderPrompt(promptObj, {});
    expect(result).toBe('Hello, world!');
  });

  it('should handle object/array returns from prompt functions', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => messages,
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
  });

  it('should handle PromptFunctionResult returns from prompt functions', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => ({
        prompt: messages,
        config: { max_tokens: 10 },
      }),
      config: {},
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
    expect(promptObj.config).toEqual({ max_tokens: 10 });
  });

  it('should set config from prompt function when initial config is undefined', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const promptObj = {
      ...toPrompt('test'),
      config: undefined,
      function: async () => ({
        prompt: messages,
        config: { max_tokens: 10 },
      }),
    };

    expect(promptObj.config).toBeUndefined();

    const result = await renderPrompt(promptObj, {});

    expect(promptObj.config).toEqual({ max_tokens: 10 });
    expect(JSON.parse(result)).toEqual(messages);
  });

  it('should replace existing config with function config', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => ({
        prompt: messages,
        config: {
          temperature: 0.8,
          max_tokens: 20,
        },
      }),
      config: {
        temperature: 0.2,
        top_p: 0.9,
      },
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
    expect(promptObj.config).toEqual({
      temperature: 0.8,
      max_tokens: 20,
      top_p: 0.9,
    });
  });
});

describe('resolveVariables', () => {
  it('should replace placeholders with corresponding variable values', () => {
    const variables = { final: '{{ my_greeting }}, {{name}}!', my_greeting: 'Hello', name: 'John' };
    const expected = { final: 'Hello, John!', my_greeting: 'Hello', name: 'John' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle nested variable substitutions', () => {
    const variables = { first: '{{second}}', second: '{{third}}', third: 'value' };
    const expected = { first: 'value', second: 'value', third: 'value' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should not modify variables without placeholders', () => {
    const variables = { greeting: 'Hello, world!', name: 'John' };
    const expected = { greeting: 'Hello, world!', name: 'John' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should not fail if a variable is not found', () => {
    const variables = { greeting: 'Hello, {{name}}!' };
    expect(resolveVariables(variables)).toEqual({ greeting: 'Hello, {{name}}!' });
  });

  it('should not fail for unresolved placeholders', () => {
    const variables = { greeting: 'Hello, {{name}}!', name: '{{unknown}}' };
    expect(resolveVariables(variables)).toEqual({
      greeting: 'Hello, {{unknown}}!',
      name: '{{unknown}}',
    });
  });
});

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not call transform if extensions array is empty', async () => {
    await runExtensionHook([], 'testHook', { data: 'test' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('should not call transform if extensions is undefined', async () => {
    await runExtensionHook(undefined, 'testHook', { data: 'test' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('should call transform for each extension', async () => {
    const extensions = ['ext1', 'ext2', 'ext3'];
    const hookName = 'testHook';
    const context = { data: 'test' };

    await runExtensionHook(extensions, hookName, context);

    expect(transform).toHaveBeenCalledTimes(3);
    expect(transform).toHaveBeenNthCalledWith(1, 'ext1', hookName, context, false);
    expect(transform).toHaveBeenNthCalledWith(2, 'ext2', hookName, context, false);
    expect(transform).toHaveBeenNthCalledWith(3, 'ext3', hookName, context, false);
  });

  it('should throw an error if an extension is not a string', async () => {
    const extensions = ['ext1', 123, 'ext3'] as string[];
    const hookName = 'testHook';
    const context = { data: 'test' };

    await expect(runExtensionHook(extensions, hookName, context)).rejects.toThrow(
      'extension must be a string',
    );
  });
});
