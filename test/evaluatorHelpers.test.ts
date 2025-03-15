import * as fs from 'fs';
import { createRequire } from 'node:module';
import * as path from 'path';
import { renderPrompt, resolveVariables, runExtensionHook } from '../src/evaluatorHelpers';
import type { Prompt } from '../src/types';
import { transform } from '../src/util/transform';

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

jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
}));

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('renderPrompt', () => {
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

    // Mock fs.readFileSync to simulate loading a YAML file
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('loaded from file');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.txt'), 'utf8');
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

    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(JSON.stringify({ key: 'valueFromJson' }));

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('testData.json'), 'utf8');
    expect(renderedPrompt).toBe('Test prompt with {"key":"valueFromJson"}');
  });

  it('should load external yaml files in renderPrompt and parse the YAML content', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file:///path/to/testData.yaml' };
    const evaluateOptions = {};

    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('key: valueFromYaml');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('testData.yaml'), 'utf8');
    expect(renderedPrompt).toBe('Test prompt with {"key":"valueFromYaml"}');
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

    // Create a prompt object with explicitly undefined config
    const promptObj = {
      ...toPrompt('test'),
      config: undefined, // Explicitly set to undefined
      function: async () => ({
        prompt: messages,
        config: { max_tokens: 10 },
      }),
    };

    // Verify config is undefined before calling renderPrompt
    expect(promptObj.config).toBeUndefined();

    const result = await renderPrompt(promptObj, {});

    // After renderPrompt, config should contain the values from result.config
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
          temperature: 0.8, // This should override the existing value
          max_tokens: 20, // This should be added
        },
      }),
      config: {
        temperature: 0.2, // This should be overridden
        top_p: 0.9, // This should be preserved
      },
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
    // Check that function config takes precedence but preserves non-overlapping keys
    expect(promptObj.config).toEqual({
      temperature: 0.8, // From function (overridden)
      max_tokens: 20, // From function (added)
      top_p: 0.9, // From original config (preserved)
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
