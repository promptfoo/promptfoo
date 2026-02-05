import { createRequire } from 'node:module';
import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectFileMetadata,
  extractTextFromPDF,
  getExtensionHookName,
  renderPrompt,
  resolveVariables,
  runExtensionHook,
} from '../src/evaluatorHelpers';
import { transform } from '../src/util/transform';

import type { ApiProvider, Prompt, TestCase, TestSuite } from '../src/types/index';

// Use vi.hoisted to define mocks and helpers that need to be accessible in vi.mock factories
const { actualPathResolve, dynamicModuleMocks, mockDynamicModule, mockPathResolve } = vi.hoisted(
  () => {
    const actualPath = require('path');
    const actualPathResolve = actualPath.resolve.bind(actualPath);
    const mockPathResolve = vi.fn((...paths: string[]) => actualPathResolve(...paths));
    const dynamicModuleMocks = new Map<string, any>();
    const mockDynamicModule = (filePath: string, moduleExport: any) => {
      const resolvedPath = actualPathResolve(filePath);
      dynamicModuleMocks.set(resolvedPath, moduleExport);
    };
    return { actualPathResolve, dynamicModuleMocks, mockDynamicModule, mockPathResolve };
  },
);

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: (...paths: string[]) => mockPathResolve(...paths),
  };
});

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: vi.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: vi.fn().mockReturnValue(mockRequire),
  };
});

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

const mockGetText = vi.fn().mockResolvedValue({ text: 'Extracted PDF text' });
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('pdf-parse', () => ({
  __esModule: true,
  PDFParse: vi.fn().mockImplementation(function () {
    return {
      getText: mockGetText,
      destroy: mockDestroy,
    };
  }),
}));

vi.mock('../src/esm', () => ({
  getDirectory: () => '/test/dir',
  importModule: vi.fn(async (filePath: string, functionName?: string) => {
    // Check if we have a dynamic mock for this path
    const resolvedPath = actualPathResolve(filePath);
    if (dynamicModuleMocks.has(resolvedPath)) {
      const mod = dynamicModuleMocks.get(resolvedPath);
      if (functionName) {
        return mod[functionName];
      }
      return mod;
    }
    // For tests that don't set up dynamic mocks, return a simple function
    return (varName: string) => ({ output: `Dynamic value for ${varName}` });
  }),
  resolvePackageEntryPoint: vi.fn((packageName: string, _baseDir: string) => {
    // Return a mock path for the package (matches what dynamic module mocks expect)
    return `/node_modules/${packageName}/index.js`;
  }),
}));
vi.mock('../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('../src/util/transform', () => ({
  transform: vi.fn(),
}));

const mockApiProvider: ApiProvider = {
  id: function id() {
    return 'test-provider';
  },
  callApi: vi.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('evaluatorHelpers', () => {
  /**
   * Reset shared mock state before each test to ensure test isolation.
   *
   * - dynamicModuleMocks: Clears the Map used by mockDynamicModule() to prevent
   *   module mocks from leaking between tests (e.g., renderPrompt external JS tests)
   * - mockPathResolve: Resets to default implementation since some tests override it
   *   with custom behavior (e.g., collectFileMetadata returns only the last path segment)
   * - vi.clearAllMocks(): Clears call history for all mocks to ensure clean assertions
   */
  beforeEach(() => {
    vi.clearAllMocks();
    dynamicModuleMocks.clear();
    mockPathResolve.mockReset();
    mockPathResolve.mockImplementation((...paths: string[]) => actualPathResolve(...paths));
  });

  describe('extractTextFromPDF', () => {
    it('should extract text from PDF successfully', async () => {
      const mockPDFText = 'Extracted PDF text';
      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));

      const result = await extractTextFromPDF('test.pdf');
      expect(result).toBe(mockPDFText);
    });

    it('should throw error when pdf-parse is not installed', async () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
      const pdfParse = await import('pdf-parse');
      vi.mocked(pdfParse.PDFParse).mockImplementationOnce(() => {
        throw new Error("Cannot find module 'pdf-parse'");
      });

      await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
        'pdf-parse is not installed. Please install it with: npm install pdf-parse',
      );
    });

    it('should handle PDF extraction errors', async () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
      mockGetText.mockRejectedValueOnce(new Error('PDF parsing failed'));

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

      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce('loaded from file');

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

      // Register dynamic module mocks
      mockDynamicModule('/path/to/testFunction.js', (varName: any, _prompt: any, _vars: any) => ({
        output: `Dynamic value for ${varName}`,
      }));
      mockDynamicModule('/path/to/testFunction.cjs', (varName: any, _prompt: any, _vars: any) => ({
        output: `and ${varName}`,
      }));
      mockDynamicModule('/path/to/testFunction.mjs', (varName: any, _prompt: any, _vars: any) => ({
        output: `and ${varName}`,
      }));

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
      vi.mocked(require.resolve).mockReturnValueOnce('/node_modules/@promptfoo/fake/index.js');

      // Register dynamic module mock for the package
      mockDynamicModule('/node_modules/@promptfoo/fake/index.js', {
        testFunction: (varName: any, _prompt: any, _vars: any) => ({
          output: `Dynamic value for ${varName}`,
        }),
      });

      const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);
      expect(renderedPrompt).toBe('Test prompt with Dynamic value for var1');
    });

    it('should load external json files in renderPrompt and parse the JSON content', async () => {
      const prompt = toPrompt('Test prompt with {{ var1 }}');
      const vars = { var1: 'file:///path/to/testData.json' };
      const evaluateOptions = {};

      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(JSON.stringify({ key: 'valueFromJson' }));

      const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('testData.json'),
        'utf8',
      );
      expect(renderedPrompt).toBe('Test prompt with {"key":"valueFromJson"}');
    });

    it('should load external yaml files in renderPrompt and parse the YAML content', async () => {
      const prompt = toPrompt('Test prompt with {{ var1 }}');
      const vars = { var1: 'file:///path/to/testData.yaml' };
      const evaluateOptions = {};

      vi.spyOn(fs, 'readFileSync').mockReturnValueOnce('key: valueFromYaml');

      const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('testData.yaml'),
        'utf8',
      );
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
      const variables = {
        final: '{{ my_greeting }}, {{name}}!',
        my_greeting: 'Hello',
        name: 'John',
      };
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
      // Reset the transform mock to return undefined by default
      vi.mocked(transform).mockResolvedValue(undefined);
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
        it('should call transform for each extension using LEGACY convention', async () => {
          // Non-file:// extensions use LEGACY calling convention: (hookName, context)
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
          vi.mocked(transform).mockResolvedValue({
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
          vi.mocked(transform).mockResolvedValue({
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
        it('should call transform for each extension using LEGACY convention', async () => {
          // Extensions without file:// prefix or function name use LEGACY convention
          const extensions = ['ext1', 'ext2', 'ext3'];
          await runExtensionHook(extensions, hookName, context);
          expect(transform).toHaveBeenCalledTimes(3);
          // LEGACY convention: (extension, hookName, context, false)
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
          vi.mocked(transform).mockResolvedValue({
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
          vi.mocked(transform).mockResolvedValue({
            test: 'invalid_test_value',
          });

          // The hook should handle this gracefully and return the modified context
          const result = await runExtensionHook(['ext1', 'ext2', 'ext3'], hookName, context);
          expect(result.test).toBe('invalid_test_value');
        });
      });
    });

    describe('hook filtering with function names', () => {
      const context = {
        suite: {
          providers: [mockApiProvider],
          prompts: [{ raw: 'test prompt', label: 'test' } as Prompt],
          tests: [{ vars: { var1: 'value1' } }],
        } as TestSuite,
      };

      beforeEach(() => {
        vi.mocked(transform).mockResolvedValue(undefined);
      });

      it('should skip extension with hook name that does not match current hook', async () => {
        // Extension specifies :afterAll but we're running beforeAll
        await runExtensionHook(['file://path/to/hooks.js:afterAll'], 'beforeAll', context);
        expect(transform).not.toHaveBeenCalled();
      });

      it('should run extension with hook name that matches current hook', async () => {
        // Extension specifies :beforeAll and we're running beforeAll
        await runExtensionHook(['file://path/to/hooks.js:beforeAll'], 'beforeAll', context);
        expect(transform).toHaveBeenCalledWith(
          'file://path/to/hooks.js:beforeAll',
          context,
          { hookName: 'beforeAll' },
          false,
        );
      });

      it('should run extension with custom function name for ALL hooks using LEGACY convention', async () => {
        // Extension specifies :myHandler (custom name) - should run for all hooks
        // Uses LEGACY calling convention: (hookName, context)
        const customExtension = 'file://path/to/hooks.js:myHandler';

        await runExtensionHook([customExtension], 'beforeAll', context);
        expect(transform).toHaveBeenCalledWith(
          customExtension,
          'beforeAll', // LEGACY: hookName as first arg
          context, // LEGACY: context as second arg
          false,
        );

        vi.mocked(transform).mockClear();
        const beforeEachContext = { test: {} as TestCase };
        await runExtensionHook([customExtension], 'beforeEach', beforeEachContext);
        expect(transform).toHaveBeenCalledWith(
          customExtension,
          'beforeEach',
          beforeEachContext,
          false,
        );

        vi.mocked(transform).mockClear();
        const afterEachContext = {
          test: {} as TestCase,
          result: {} as any,
        };
        await runExtensionHook([customExtension], 'afterEach', afterEachContext);
        expect(transform).toHaveBeenCalledWith(
          customExtension,
          'afterEach',
          afterEachContext,
          false,
        );

        vi.mocked(transform).mockClear();
        const afterAllContext = {
          results: [],
          suite: {} as TestSuite,
          prompts: [],
          evalId: 'test-eval-id',
          config: {},
        };
        await runExtensionHook([customExtension], 'afterAll', afterAllContext);
        expect(transform).toHaveBeenCalledWith(customExtension, 'afterAll', afterAllContext, false);
      });

      it('should run extension without function name for ALL hooks using LEGACY convention', async () => {
        // Extension without function name - should run for all hooks
        // Uses LEGACY calling convention: (hookName, context)
        const noFunctionExtension = 'file://path/to/hooks.js';

        await runExtensionHook([noFunctionExtension], 'beforeAll', context);
        expect(transform).toHaveBeenCalledWith(
          noFunctionExtension,
          'beforeAll', // LEGACY: hookName as first arg
          context, // LEGACY: context as second arg
          false,
        );

        vi.mocked(transform).mockClear();
        const afterEachContext = {
          test: {} as TestCase,
          result: {} as any,
        };
        await runExtensionHook([noFunctionExtension], 'afterEach', afterEachContext);
        expect(transform).toHaveBeenCalledWith(
          noFunctionExtension,
          'afterEach',
          afterEachContext,
          false,
        );
      });

      it('should handle mixed extensions with correct calling conventions', async () => {
        // Mix of hook-specific and generic extensions
        const extensions = [
          'file://hooks.js:beforeAll', // Only runs for beforeAll, NEW convention
          'file://hooks.js:myHandler', // Runs for all hooks, LEGACY convention
          'file://hooks.js:afterAll', // Only runs for afterAll (skipped here)
        ];

        await runExtensionHook(extensions, 'beforeAll', context);
        // Should call transform twice (beforeAll and myHandler, skip afterAll)
        expect(transform).toHaveBeenCalledTimes(2);

        // First call: :beforeAll uses NEW convention
        expect(transform).toHaveBeenCalledWith(
          'file://hooks.js:beforeAll',
          context, // NEW: context as first arg
          { hookName: 'beforeAll' }, // NEW: hookName in object as second arg
          false,
        );

        // Second call: :myHandler uses LEGACY convention
        expect(transform).toHaveBeenCalledWith(
          'file://hooks.js:myHandler',
          'beforeAll', // LEGACY: hookName as first arg
          context, // LEGACY: context as second arg
          false,
        );
      });
    });
  });

  describe('getExtensionHookName', () => {
    it('should extract function name from file:// path', () => {
      expect(getExtensionHookName('file://path/to/hooks.js:beforeAll')).toBe('beforeAll');
      expect(getExtensionHookName('file://path/to/hooks.py:afterEach')).toBe('afterEach');
      expect(getExtensionHookName('file://hooks.js:myHandler')).toBe('myHandler');
    });

    it('should return undefined when no function name specified', () => {
      expect(getExtensionHookName('file://path/to/hooks.js')).toBeUndefined();
      expect(getExtensionHookName('file://hooks.py')).toBeUndefined();
    });

    it('should return undefined for non-file:// paths', () => {
      expect(getExtensionHookName('path/to/hooks.js:beforeAll')).toBeUndefined();
      expect(getExtensionHookName('hooks.js:beforeAll')).toBeUndefined();
    });

    it('should handle Windows drive letters correctly', () => {
      // Position 7 is C:, position 8 is the colon after drive letter
      // The function should not treat C: as function name
      expect(getExtensionHookName('file://C:/path/to/hooks.js')).toBeUndefined();
      expect(getExtensionHookName('file://C:/path/to/hooks.js:beforeAll')).toBe('beforeAll');
      expect(getExtensionHookName('file://D:/hooks.js:myHandler')).toBe('myHandler');
    });

    it('should extract the last colon-separated segment', () => {
      // Multiple colons - should get the last one
      expect(getExtensionHookName('file://path:with:colons/hooks.js:functionName')).toBe(
        'functionName',
      );
    });

    it('should return undefined for trailing colon (empty function name)', () => {
      // Edge case: "file://hooks.js:" should not return empty string
      expect(getExtensionHookName('file://hooks.js:')).toBeUndefined();
      expect(getExtensionHookName('file://path/to/hooks.py:')).toBeUndefined();
    });
  });

  describe('runExtensionHook error handling', () => {
    const context = {
      suite: {
        providers: [mockApiProvider],
        prompts: [{ raw: 'test prompt', label: 'test' } as Prompt],
        tests: [{ vars: { var1: 'value1' } }],
      } as TestSuite,
    };

    it('should wrap transform errors with hook context', async () => {
      const originalError = new Error('Python script failed');
      vi.mocked(transform).mockRejectedValue(originalError);

      await expect(
        runExtensionHook(['file://broken.py:handler'], 'beforeAll', context),
      ).rejects.toThrow('Extension hook "beforeAll" failed for file://broken.py:handler');
    });

    it('should preserve original error as cause', async () => {
      const originalError = new Error('Original error message');
      vi.mocked(transform).mockRejectedValue(originalError);

      try {
        await runExtensionHook(['file://broken.js:handler'], 'beforeAll', context);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).cause).toBe(originalError);
      }
    });
  });

  describe('collectFileMetadata', () => {
    beforeEach(() => {
      // Override mockPathResolve to return only the last path segment for these tests
      mockPathResolve.mockImplementation((...paths: string[]) => {
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
      // Override mockPathResolve to return only the last path segment for these tests
      mockPathResolve.mockImplementation((...paths: string[]) => {
        return paths[paths.length - 1];
      });

      // Mock fs.readFileSync to return predictable base64 data for different image types
      vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
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
      vi.restoreAllMocks();
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
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAA', 'base64'); // PNG magic
      });

      const renderedPrompt = await renderPrompt(prompt, {
        image: 'file://wrong-extension.jpg', // .jpg extension
      });

      // Should detect PNG from magic number, not extension
      expect(renderedPrompt).toContain('data:image/png;base64,');
    });

    it('should maintain existing behavior for video files (raw base64)', async () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
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
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
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
});
