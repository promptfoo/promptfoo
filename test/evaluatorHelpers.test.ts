import { createRequire } from 'node:module';
import * as fs from 'fs';
import * as path from 'path';

import {
  collectFileMetadata,
  extractTextFromPDF,
  renderPrompt,
  resolveVariables,
  runExtensionHook,
} from '../src/evaluatorHelpers';
import { transform } from '../src/util/transform';

import type { ApiProvider, Prompt, TestCase, TestSuite } from '../src/types/index';

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

jest.mock(
  'pdf-parse',
  () => ({
    __esModule: true,
    default: jest
      .fn()
      .mockImplementation((_buffer) => Promise.resolve({ text: 'Extracted PDF text' })),
  }),
  { virtual: true },
);

jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
}));

const mockApiProvider: ApiProvider = {
  id: function id() {
    return 'test-provider';
  },
  callApi: jest.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('extractTextFromPDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract text from PDF successfully', async () => {
    const mockPDFText = 'Extracted PDF text';
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));

    const result = await extractTextFromPDF('test.pdf');
    expect(result).toBe(mockPDFText);
  });

  it('should throw error when pdf-parse is not installed', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
    const mockPDFParse = jest.requireMock('pdf-parse');
    mockPDFParse.default.mockImplementationOnce(() => {
      throw new Error("Cannot find module 'pdf-parse'");
    });

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'pdf-parse is not installed. Please install it with: npm install pdf-parse',
    );
  });

  it('should handle PDF extraction errors', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
    const mockPDFParse = jest.requireMock('pdf-parse');
    mockPDFParse.default.mockRejectedValueOnce(new Error('PDF parsing failed'));

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'Failed to extract text from PDF test.pdf: PDF parsing failed',
    );
  });
});

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

  it('should render environment variables in JSON prompts', async () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const prompt = toPrompt('{"text": "{{ env.TEST_ENV_VAR }}"}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe(JSON.stringify({ text: 'env_value' }, null, 2));
    delete process.env.TEST_ENV_VAR;
  });

  it('should render environment variables in non-JSON prompts', async () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const prompt = toPrompt('Test prompt {{ env.TEST_ENV_VAR }}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Test prompt env_value');
    delete process.env.TEST_ENV_VAR;
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
      () => (varName: any, _prompt: any, _vars: any) => ({
        output: `Dynamic value for ${varName}`,
      }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.cjs'),
      () => (varName: any, _prompt: any, _vars: any) => ({ output: `and ${varName}` }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.mjs'),
      () => (varName: any, _prompt: any, _vars: any) => ({ output: `and ${varName}` }),
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
      () => ({
        testFunction: (varName: any, _prompt: any, _vars: any) => ({
          output: `Dynamic value for ${varName}`,
        }),
      }),
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

  it('should respect Nunjucks raw tags when variable is provided as a string', async () => {
    const prompt = toPrompt('{% raw %}{{ var1 }}{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks raw tags when no variables are provided', async () => {
    const prompt = toPrompt('{% raw %}{{ var1 }}{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks escaped strings when variable is provided as a string', async () => {
    const prompt = toPrompt(`{{ '{{ var1 }}' }}`);
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks escaped strings when no variables are provided', async () => {
    const prompt = toPrompt(`{{ '{{ var1 }}' }}`);
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should render variables that are template strings', async () => {
    const prompt = toPrompt('{{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: '{{ var2 }}', var2: 'value2' }, {});
    expect(renderedPrompt).toBe('value2');
  });

  it('should auto-wrap prompts with partial Nunjucks tags in {% raw %}', async () => {
    const prompt = toPrompt('This is a partial tag: {%');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('This is a partial tag: {%');
  });

  it('should not double-wrap prompts already wrapped in {% raw %}', async () => {
    const prompt = toPrompt('{% raw %}This is a partial tag: {%{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('This is a partial tag: {%');
  });

  it('should not wrap prompts with valid Nunjucks tags', async () => {
    const prompt = toPrompt('Hello {{ name }}!');
    const renderedPrompt = await renderPrompt(prompt, { name: 'Alice' }, {});
    expect(renderedPrompt).toBe('Hello Alice!');
    expect(renderedPrompt).not.toContain('{% raw %}');
  });

  it('should auto-wrap prompts with partial variable tags', async () => {
    const prompt = toPrompt('Unfinished variable: {{ name');
    const renderedPrompt = await renderPrompt(prompt, { name: 'Alice' }, {});
    expect(renderedPrompt).toBe('Unfinished variable: {{ name');
  });

  it('should auto-wrap prompts with partial comment tags', async () => {
    const prompt = toPrompt('Unfinished comment: {# comment');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Unfinished comment: {# comment');
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

  it('should handle Date objects as variables', () => {
    const dateObj = new Date('2024-01-15T00:00:00.000Z');
    const variables = {
      greeting: 'Hello, {{name}}!',
      name: 'John',
      research_date: dateObj,
      date_string: '{{ research_date }}',
    };
    const expected = {
      greeting: 'Hello, John!',
      name: 'John',
      research_date: dateObj,
      date_string: dateObj.toString(), // Date objects use toString() for template replacement
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle object variables in template references', () => {
    const complexObj = { id: 123, name: 'Test Object' };
    const variables = {
      greeting: 'Hello, {{name}}!',
      name: 'John',
      config: complexObj,
      config_ref: '{{ config }}',
    };
    const expected = {
      greeting: 'Hello, John!',
      name: 'John',
      config: complexObj,
      config_ref: '[object Object]', // When object is converted to string
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });
});

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the transform mock to return undefined by default
    jest.mocked(transform).mockResolvedValue(undefined);
  });

  describe('beforeAll', () => {
    const hookName = 'beforeAll';
    const context = {
      suite: {
        providers: [mockApiProvider],
        prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
        tests: [
          {
            vars: { var1: 'value1', var2: 'value2' },
          },
        ],
      } as TestSuite,
    };

    describe('no extensions provided', () => {
      it('should not call transform', async () => {
        await runExtensionHook([], hookName, context);
        expect(transform).not.toHaveBeenCalled();

        await runExtensionHook(undefined, hookName, context);
        expect(transform).not.toHaveBeenCalled();

        await runExtensionHook(null, hookName, context);
        expect(transform).not.toHaveBeenCalled();
      });

      it('should return the original context', async () => {
        const out = await runExtensionHook([], hookName, context);
        expect(out).toEqual(context);
        const out2 = await runExtensionHook(undefined, hookName, context);
        expect(out2).toEqual(context);
        const out3 = await runExtensionHook(null, hookName, context);
        expect(out3).toEqual(context);
      });
    });

    describe('extensions provided', () => {
      it('should call transform for each extension', async () => {
        const extensions = ['ext1', 'ext2', 'ext3'];
        await runExtensionHook(extensions, hookName, context);
        expect(transform).toHaveBeenCalledTimes(3);
        expect(transform).toHaveBeenNthCalledWith(1, 'ext1', hookName, context, false);
        expect(transform).toHaveBeenNthCalledWith(2, 'ext2', hookName, context, false);
        expect(transform).toHaveBeenNthCalledWith(3, 'ext3', hookName, context, false);
      });

      it('should return the original context when extension(s) do not return a value', async () => {
        const out = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);
        expect(out).toEqual(context);
      });

      it('returned context should conform to the expected schema', async () => {
        // Re-mock the transform function to return a valid context (with a new tag)
        jest.mocked(transform).mockResolvedValue({
          suite: {
            providers: context.suite.providers,
            prompts: context.suite.prompts,
            tests: context.suite.tests,
          },
        });

        const out = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);

        // Check the structure without relying on exact function name matching
        expect(out.suite.providers).toHaveLength(1);
        expect(out.suite.providers[0]).toHaveProperty('id');
        expect(out.suite.providers[0]).toHaveProperty('callApi');
        expect(typeof out.suite.providers[0].id).toBe('function');
        expect(out.suite.providers[0].id()).toBe('test-provider');
        expect(out.suite.prompts).toEqual(context.suite.prompts);
        expect(out.suite.tests).toEqual(context.suite.tests);
      });

      it('should handle invalid context but not throw validation error', async () => {
        // Re-mock the transform function to return a context with custom properties and valid mutable properties
        jest.mocked(transform).mockResolvedValue({
          suite: {
            foo: 'bar', // This will be ignored as it's not a mutable property
            tests: [{ vars: { newVar: 'newValue' } }], // This will be used as it's mutable
          },
        });

        // The hook should handle this gracefully and return the modified context
        const result = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);
        // Only mutable properties are updated, custom properties like 'foo' are ignored
        expect(result.suite.providers).toBeDefined(); // Original providers preserved
        expect(result.suite.tests).toEqual([{ vars: { newVar: 'newValue' } }]); // Tests updated
        expect(result.suite).not.toHaveProperty('foo'); // Custom property ignored
      });
    });
  });

  describe('beforeEach', () => {
    const hookName = 'beforeEach';
    const context = {
      test: {
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected' }],
      } as TestCase,
    };

    describe('no extensions provided', () => {
      it('should not call transform', async () => {
        await runExtensionHook([], hookName, context);
        expect(transform).not.toHaveBeenCalled();

        await runExtensionHook(undefined, hookName, context);
        expect(transform).not.toHaveBeenCalled();

        await runExtensionHook(null, hookName, context);
        expect(transform).not.toHaveBeenCalled();
      });

      it('should return the original context', async () => {
        const out = await runExtensionHook([], hookName, context);
        expect(out).toEqual(context);
        const out2 = await runExtensionHook(undefined, hookName, context);
        expect(out2).toEqual(context);
        const out3 = await runExtensionHook(null, hookName, context);
        expect(out3).toEqual(context);
      });
    });

    describe('extensions provided', () => {
      beforeEach(() => {
        // Reset the mock to return undefined for these tests
        jest.mocked(transform).mockResolvedValue(undefined);
      });

      it('should call transform for each extension', async () => {
        const extensions = ['ext1', 'ext2', 'ext3'];
        await runExtensionHook(extensions, hookName, context);
        expect(transform).toHaveBeenCalledTimes(3);
        expect(transform).toHaveBeenNthCalledWith(1, 'ext1', hookName, context, false);
        expect(transform).toHaveBeenNthCalledWith(2, 'ext2', hookName, context, false);
        expect(transform).toHaveBeenNthCalledWith(3, 'ext3', hookName, context, false);
      });

      it('should return the original context when extension(s) do not return a value', async () => {
        const out = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);
        expect(out).toEqual(context);
      });

      it('returned context should conform to the expected schema', async () => {
        // Re-mock the transform function to return a valid context (with modified test)
        jest.mocked(transform).mockResolvedValue({
          test: {
            vars: { var1: 'modified_value1', var2: 'modified_value2' },
            assert: [{ type: 'equals', value: 'modified_expected' }],
          },
        });

        const out = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);

        expect(out.test.vars).toEqual({ var1: 'modified_value1', var2: 'modified_value2' });
        expect(out.test.assert).toEqual([{ type: 'equals', value: 'modified_expected' }]);
      });

      it('should handle invalid context but not throw validation error', async () => {
        // Re-mock the transform function to return an invalid context (test should be an object, not a string)
        jest.mocked(transform).mockResolvedValue({
          test: 'invalid_test_value',
        });

        // The hook should handle this gracefully and return the modified context
        const result = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);
        expect(result.test).toBe('invalid_test_value');
      });
    });
  });
});

describe('collectFileMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(path, 'resolve').mockImplementation((...paths) => {
      return paths[paths.length - 1];
    });
  });

  it('should identify image files correctly', () => {
    const vars = {
      image1: 'file://path/to/image.jpg',
      image2: 'file://path/to/image.png',
      image3: 'file://path/to/image.webp',
      text: 'This is not a file',
      otherFile: 'file://path/to/document.txt',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      image1: {
        path: 'file://path/to/image.jpg',
        type: 'image',
        format: 'jpg',
      },
      image2: {
        path: 'file://path/to/image.png',
        type: 'image',
        format: 'png',
      },
      image3: {
        path: 'file://path/to/image.webp',
        type: 'image',
        format: 'webp',
      },
    });
  });

  it('should identify video files correctly', () => {
    const vars = {
      video1: 'file://path/to/video.mp4',
      video2: 'file://path/to/video.webm',
      video3: 'file://path/to/video.mkv',
      text: 'This is not a file',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      video1: {
        path: 'file://path/to/video.mp4',
        type: 'video',
        format: 'mp4',
      },
      video2: {
        path: 'file://path/to/video.webm',
        type: 'video',
        format: 'webm',
      },
      video3: {
        path: 'file://path/to/video.mkv',
        type: 'video',
        format: 'mkv',
      },
    });
  });

  it('should identify audio files correctly', () => {
    const vars = {
      audio1: 'file://path/to/audio.mp3',
      audio2: 'file://path/to/audio.wav',
      text: 'This is not a file',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      audio1: {
        path: 'file://path/to/audio.mp3',
        type: 'audio',
        format: 'mp3',
      },
      audio2: {
        path: 'file://path/to/audio.wav',
        type: 'audio',
        format: 'wav',
      },
    });
  });

  it('should return an empty object when no media files are found', () => {
    const vars = {
      text1: 'This is not a file',
      text2: 'file://path/to/document.txt',
      text3: 'file://path/to/document.pdf',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({});
  });

  it('should handle non-string values correctly', () => {
    const vars = {
      text: 'file://path/to/image.jpg',
      object: { key: 'value' },
      array: ['file://path/to/video.mp4'],
      number: 42 as unknown as string,
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      text: {
        path: 'file://path/to/image.jpg',
        type: 'image',
        format: 'jpg',
      },
    });
  });
});
describe('Image Data URL Generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(path, 'resolve').mockImplementation((...paths) => {
      return paths[paths.length - 1];
    });

    // Mock fs.readFileSync to return predictable base64 data for different image types
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('.jpg') || pathStr.includes('.jpeg')) {
        // JPEG magic number: /9j/
        return Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAA', 'base64');
      } else if (pathStr.includes('.png')) {
        // PNG magic number: iVBORw0KGgo
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAA', 'base64');
      } else if (pathStr.includes('.gif')) {
        // GIF magic number: R0lGODlh
        return Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEA', 'base64');
      } else if (pathStr.includes('.webp')) {
        // WebP magic number: UklGR
        return Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAv', 'base64');
      } else if (pathStr.includes('.bmp')) {
        // BMP magic number: Qk0
        return Buffer.from('Qk02AAAAAAAAADYAAAAoAAAAAQ', 'base64');
      } else if (pathStr.includes('.svg')) {
        return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      } else {
        return Buffer.from('test-file-content');
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should generate data URL for JPEG files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.jpg',
    });

    expect(renderedPrompt).toContain('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAA=');
  });

  it('should generate data URL for PNG files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.png',
    });

    expect(renderedPrompt).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA');
  });

  it('should generate data URL for GIF files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.gif',
    });

    expect(renderedPrompt).toContain('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEA');
  });

  it('should generate data URL for WebP files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.webp',
    });

    expect(renderedPrompt).toContain('data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAv');
  });

  it('should generate data URL for BMP files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.bmp',
    });

    expect(renderedPrompt).toContain('data:image/bmp;base64,Qk02AAAAAAAAADYAAAAoAAAAAQ');
  });

  it('should generate data URL for SVG files', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.svg',
    });

    expect(renderedPrompt).toContain('data:image/svg+xml;base64,');
    expect(renderedPrompt).toContain(
      'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
    ); // base64 of SVG content
  });

  it('should handle case-insensitive file extensions', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://test-image.JPG',
    });

    expect(renderedPrompt).toContain('data:image/jpeg;base64,');
  });

  it('should use magic number detection for accurate MIME type', async () => {
    // Test file with wrong extension but correct magic number
    const prompt = toPrompt('Test prompt with image: {{image}}');

    // Mock a file with .jpg extension but PNG magic number
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      return Buffer.from('iVBORw0KGgoAAAANSUhEUgAA', 'base64'); // PNG magic
    });

    const renderedPrompt = await renderPrompt(prompt, {
      image: 'file://wrong-extension.jpg', // .jpg extension
    });

    // Should detect PNG from magic number, not extension
    expect(renderedPrompt).toContain('data:image/png;base64,');
  });

  it('should maintain existing behavior for video files (raw base64)', async () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      return Buffer.from('test-video-content');
    });

    const prompt = toPrompt('Test prompt with video: {{video}}');
    const renderedPrompt = await renderPrompt(prompt, {
      video: 'file://test-video.mp4',
    });

    // Should NOT have data: prefix for videos
    expect(renderedPrompt).not.toContain('data:video');
    expect(renderedPrompt).toContain('dGVzdC12aWRlby1jb250ZW50'); // base64 of 'test-video-content'
  });

  it('should maintain existing behavior for audio files (raw base64)', async () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      return Buffer.from('test-audio-content');
    });

    const prompt = toPrompt('Test prompt with audio: {{audio}}');
    const renderedPrompt = await renderPrompt(prompt, {
      audio: 'file://test-audio.mp3',
    });

    // Should NOT have data: prefix for audio
    expect(renderedPrompt).not.toContain('data:audio');
    expect(renderedPrompt).toContain('dGVzdC1hdWRpby1jb250ZW50'); // base64 of 'test-audio-content'
  });

  it('should handle Azure Vision prompt structure correctly', async () => {
    const azureVisionPrompt = toPrompt(`[
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What do you see in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "{{image_url}}"
            }
          }
        ]
      }
    ]`);

    const renderedPrompt = await renderPrompt(azureVisionPrompt, {
      image_url: 'file://test-image.jpg',
    });

    const parsed = JSON.parse(renderedPrompt);
    const imageUrl = parsed[0].content[1].image_url.url;

    expect(imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageUrl).toContain('/9j/4AAQSkZJRgABAQEASABIAAA=');
  });

  it('should work with existing data URLs (no double processing)', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const existingDataUrl = 'data:image/jpeg;base64,/9j/existingimage';

    // Should not process files that don't start with file://
    const renderedPrompt = await renderPrompt(prompt, {
      image: existingDataUrl,
    });

    expect(renderedPrompt).toContain(existingDataUrl);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should work with HTTP URLs (no processing)', async () => {
    const prompt = toPrompt('Test prompt with image: {{image}}');
    const httpUrl = 'https://example.com/image.jpg';

    const renderedPrompt = await renderPrompt(prompt, {
      image: httpUrl,
    });

    expect(renderedPrompt).toContain(httpUrl);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
});
