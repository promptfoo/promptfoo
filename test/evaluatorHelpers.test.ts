import * as fs from 'fs';
import { createRequire } from 'node:module';
import * as path from 'path';
import { getEnvBool } from '../src/envars';
import {
  extractTextFromPDF,
  renderPrompt,
  resolveVariables,
  runExtensionHook,
} from '../src/evaluatorHelpers';
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
jest.mock('../src/logger');
jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
}));

jest.mock('pdf-parse', () => {
  let mockImpl = jest.fn().mockResolvedValue({ text: 'extracted pdf text' });
  return {
    __esModule: true,
    default: mockImpl,
    _setMockImplementation: (impl: any) => {
      mockImpl = impl;
    },
  };
});

jest.mock('../src/integrations/portkey', () => ({
  getPrompt: jest.fn().mockResolvedValue({ messages: [{ role: 'user', content: 'test' }] }),
}));

jest.mock('../src/integrations/langfuse', () => ({
  getPrompt: jest.fn().mockResolvedValue('langfuse result'),
}));

jest.mock('../src/integrations/helicone', () => ({
  getPrompt: jest.fn().mockResolvedValue('helicone result'),
}));

jest.mock('../src/envars', () => ({
  ...jest.requireActual('../src/envars'),
  getEnvBool: jest.fn().mockReturnValue(false),
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

  it('should render a JSON prompt', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(JSON.parse('[{"text":"Test prompt "},{"text":"value1"}]'), null, 2),
    );
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

  it('should handle different whitespace patterns in placeholders', () => {
    const variables = {
      noSpace: '{{var}}',
      oneSpace: '{{ var }}',
      multipleSpaces: '{{   var   }}',
      var: 'value',
    };
    const expected = {
      noSpace: 'value',
      oneSpace: 'value',
      multipleSpaces: 'value',
      var: 'value',
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should stop after 5 iterations for circular dependencies', () => {
    const variables = {
      a: '{{b}}',
      b: '{{c}}',
      c: '{{d}}',
      d: '{{e}}',
      e: '{{f}}',
      f: '{{e}}',
    };
    const result = resolveVariables(variables);
    expect(result).toEqual({
      a: '{{e}}',
      b: '{{e}}',
      c: '{{e}}',
      d: '{{e}}',
      e: '{{e}}',
      f: '{{e}}',
    });
  });

  it('should handle non-string values', () => {
    const variables = {
      string: 'plain text',
      obj: { key: 'value' },
      num: { value: 42 },
      bool: { value: true },
      arr: ['test'],
    };
    const expected = {
      string: 'plain text',
      obj: { key: 'value' },
      num: { value: 42 },
      bool: { value: true },
      arr: ['test'],
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should resolve multiple variables in a single string', () => {
    const variables = {
      template: '{{greeting}} {{name}}! How is {{location}}?',
      greeting: 'Hello',
      name: 'John',
      location: 'New York',
    };
    const expected = {
      template: 'Hello John! How is New York?',
      greeting: 'Hello',
      name: 'John',
      location: 'New York',
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle nested variable resolution in correct order', () => {
    const variables = {
      template: '{{message}}',
      message: '{{greeting}} {{person}}',
      greeting: 'Hello',
      person: '{{name}}',
      name: 'John',
    };
    const expected = {
      template: 'Hello John',
      message: 'Hello John',
      greeting: 'Hello',
      person: 'John',
      name: 'John',
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle partial variable resolution', () => {
    const variables = {
      template: '{{greeting}} {{unknown}}',
      greeting: 'Hello',
    };
    const expected = {
      template: 'Hello {{unknown}}',
      greeting: 'Hello',
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should preserve text around unresolved variables', () => {
    const variables = {
      template: 'Start {{missing}} middle {{also_missing}} end',
    };
    const expected = {
      template: 'Start {{missing}} middle {{also_missing}} end',
    };
    expect(resolveVariables(variables)).toEqual(expected);
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

describe('extractTextFromPDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract text from PDF', async () => {
    const result = await extractTextFromPDF('test.pdf');
    expect(result).toBe('extracted pdf text');
  });
});

describe('renderPrompt additional cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle prompt functions returning string', async () => {
    const prompt: Prompt = {
      raw: 'base prompt',
      label: 'test',
      function: async () => 'function result',
    };
    const result = await renderPrompt(prompt, {});
    expect(result).toBe('function result');
  });

  it('should handle prompt functions returning object', async () => {
    const prompt: Prompt = {
      raw: 'base prompt',
      label: 'test',
      function: async () => ({ key: 'value' }),
    };
    const result = await renderPrompt(prompt, {});
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('should throw on invalid prompt function return type', async () => {
    const prompt: Prompt = {
      raw: 'base prompt',
      label: 'test',
      function: async () => 42 as any,
    };
    await expect(renderPrompt(prompt, {})).rejects.toThrow(
      'Prompt function must return a string or object, got number',
    );
  });

  it('should handle portkey integration', async () => {
    const prompt: Prompt = {
      raw: 'portkey://test-prompt',
      label: 'test',
    };
    const result = await renderPrompt(prompt, {});
    expect(JSON.parse(result)).toEqual([{ role: 'user', content: 'test' }]);
  });

  it('should handle langfuse integration with text type', async () => {
    const prompt: Prompt = {
      raw: 'langfuse://helper:1:text',
      label: 'test',
    };
    const result = await renderPrompt(prompt, {});
    expect(result).toBe('langfuse result');
  });

  it('should throw on invalid langfuse prompt type', async () => {
    const prompt: Prompt = {
      raw: 'langfuse://helper:1:invalid',
      label: 'test',
    };

    await expect(renderPrompt(prompt, {})).rejects.toThrow('Unknown promptfoo prompt type');
  });

  it('should handle helicone integration', async () => {
    const prompt: Prompt = {
      raw: 'helicone://test-id:1.2',
      label: 'test',
    };
    const result = await renderPrompt(prompt, {});
    expect(result).toBe('helicone result');
  });

  it('should handle disabled JSON autoescape', async () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    const prompt: Prompt = {
      raw: '{"test": "{{ var }}"}',
      label: 'test',
    };
    const result = await renderPrompt(prompt, { var: 'value' });
    expect(JSON.parse(result)).toEqual({ test: 'value' });
  });
});
