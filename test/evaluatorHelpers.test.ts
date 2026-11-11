import { createRequire } from 'node:module';
import * as fs from 'fs';
import * as path from 'path';

import nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AfterEachExtensionHookContext,
  collectFileMetadata,
  extractTextFromPDF,
  getExtensionHookName,
  renderPrompt,
  resolveVariables,
  runExtensionHook,
} from '../src/evaluatorHelpers';
import { getPrompt as getHeliconePrompt } from '../src/integrations/helicone';
import { getPrompt as getLangfusePrompt } from '../src/integrations/langfuse';
import { getPrompt as getPortkeyPrompt } from '../src/integrations/portkey';
import logger from '../src/logger';
import { AIStudioChatProvider } from '../src/providers/google/ai.studio';
import { runPython } from '../src/python/pythonUtils';
import { getNunjucksEngine } from '../src/util/templates';
import { transform } from '../src/util/transform';
import { createMockProvider } from './factories/provider';
import { mockProcessEnv } from './util/utils';

import type { Prompt, TestCase, TestSuite } from '../src/types/index';

// Use vi.hoisted to define mocks and helpers that need to be accessible in vi.mock factories
const { actualPathResolve, dynamicModuleMocks, fsMocks, mockDynamicModule, mockPathResolve } =
  vi.hoisted(() => {
    const actualPath = require('path');
    const actualPathResolve = actualPath.resolve.bind(actualPath);
    const mockPathResolve = vi.fn((...paths: string[]) => actualPathResolve(...paths));
    const dynamicModuleMocks = new Map<string, any>();
    const mockDynamicModule = (filePath: string, moduleExport: any) => {
      const resolvedPath = actualPathResolve(filePath);
      dynamicModuleMocks.set(resolvedPath, moduleExport);
    };
    const fsMocks = {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
    };
    return { actualPathResolve, dynamicModuleMocks, fsMocks, mockDynamicModule, mockPathResolve };
  });

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
  ...fsMocks,
  promises: {
    readFile: fsMocks.readFileSync,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: fsMocks.readFileSync,
  },
  readFile: fsMocks.readFileSync,
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

vi.mock('../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

vi.mock('../src/integrations/helicone', () => ({
  getPrompt: vi.fn(),
}));

vi.mock('../src/integrations/langfuse', () => ({
  getPrompt: vi.fn(),
}));

vi.mock('../src/integrations/portkey', () => ({
  getPrompt: vi.fn(),
}));

const mockApiProvider = createMockProvider();

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
    vi.mocked(runPython).mockReset();
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
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
      mockProcessEnv({ PROMPTFOO_DISABLE_JSON_AUTOESCAPE: undefined });
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

    it('should not corrupt dollar-sign sequences when pre-resolving nested variables', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('Say {{greeting}}'),
        { greeting: 'Cost is {{price}}', price: 'only $`5' },
        {},
      );
      expect(renderedPrompt).toBe('Say Cost is only $`5');
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
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      const prompt = toPrompt('{"text": "{{ env.TEST_ENV_VAR }}"}');
      const renderedPrompt = await renderPrompt(prompt, {}, {});
      expect(renderedPrompt).toBe(JSON.stringify({ text: 'env_value' }, null, 2));
      mockProcessEnv({ TEST_ENV_VAR: undefined });
    });

    it('should render environment variables in non-JSON prompts', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      const prompt = toPrompt('Test prompt {{ env.TEST_ENV_VAR }}');
      const renderedPrompt = await renderPrompt(prompt, {}, {});
      expect(renderedPrompt).toBe('Test prompt env_value');
      mockProcessEnv({ TEST_ENV_VAR: undefined });
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

    it('should accept an empty string from an external JavaScript variable', async () => {
      const prompt = toPrompt('before{{ var1 }}after');
      const vars = { var1: 'file:///path/to/empty.js' };

      mockDynamicModule('/path/to/empty.js', () => ({ output: '' }));

      await expect(renderPrompt(prompt, vars, {})).resolves.toBe('beforeafter');
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

    it('should accept an empty string from a package variable', async () => {
      const prompt = toPrompt('before{{ var1 }}after');
      const vars = { var1: 'package:@promptfoo/fake:emptyVariable' };

      const require = createRequire('');
      vi.mocked(require.resolve).mockReturnValueOnce('/node_modules/@promptfoo/fake/index.js');
      mockDynamicModule('/node_modules/@promptfoo/fake/index.js', {
        emptyVariable: () => ({ output: '' }),
      });

      await expect(renderPrompt(prompt, vars, {})).resolves.toBe('beforeafter');
    });

    it('should accept an empty string from an external Python variable', async () => {
      const prompt = toPrompt('before{{ var1 }}after');
      const vars = { var1: 'file:///path/to/empty.py' };

      vi.mocked(runPython).mockResolvedValueOnce({ output: '' });

      await expect(renderPrompt(prompt, vars, {})).resolves.toBe('beforeafter');
    });

    it.each([undefined, null, false, 0, 1, [], {}])(
      'rejects non-string JavaScript variable output %j',
      async (output) => {
        mockDynamicModule('/path/to/variable.js', () => ({ output }));

        await expect(
          renderPrompt(toPrompt('{{ var1 }}'), { var1: 'file:///path/to/variable.js' }, {}),
        ).rejects.toThrow('to return { output: string }');
      },
    );

    it.each([undefined, null, false, 0, 1, [], {}])(
      'rejects non-string package variable output %j',
      async (output) => {
        mockDynamicModule('/node_modules/@promptfoo/fake/index.js', {
          variable: () => ({ output }),
        });

        await expect(
          renderPrompt(toPrompt('{{ var1 }}'), { var1: 'package:@promptfoo/fake:variable' }, {}),
        ).rejects.toThrow('to return { output: string }');
      },
    );

    it.each([undefined, null, false, 0, 1, [], {}])(
      'rejects non-string Python variable output %j',
      async (output) => {
        vi.mocked(runPython).mockResolvedValueOnce({ output });

        await expect(
          renderPrompt(toPrompt('{{ var1 }}'), { var1: 'file:///path/to/variable.py' }, {}),
        ).rejects.toThrow(output == null ? 'did not return any output' : 'must be a string');
      },
    );

    it('should throw a clear error when a package variable does not export a function', async () => {
      const prompt = toPrompt('Test prompt with {{ var1 }}');
      const vars = {
        var1: 'package:@promptfoo/fake:testFunction',
      };

      mockDynamicModule('/node_modules/@promptfoo/fake/index.js', {
        testFunction: false,
      });

      await expect(renderPrompt(prompt, vars, {})).rejects.toThrow(
        'Variable source malformed: package:@promptfoo/fake:testFunction must export a function. Received: boolean',
      );
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
        mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
      });

      afterEach(() => {
        mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
      });

      it('should return raw prompt when templating is disabled', async () => {
        const prompt = toPrompt('Test prompt {{ var1 }}');
        const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
        expect(renderedPrompt).toBe('Test prompt {{ var1 }}');
      });
    });

    it('should render normally when templating is enabled', async () => {
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'false' });
      const prompt = toPrompt('Test prompt {{ var1 }}');
      const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
      expect(renderedPrompt).toBe('Test prompt value1');
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
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

    it.each(['ordinary text', '$$', '$&', '$`', "$'"])(
      'should insert %s literally into repeated placeholders',
      (price) => {
        const variables = { greeting: 'Say {{price}} then {{price}}!', price };
        expect(resolveVariables(variables)).toEqual({
          greeting: `Say ${price} then ${price}!`,
          price,
        });
      },
    );

    it('should leave placeholders inside raw blocks untouched', () => {
      const variables = {
        varOne: 'abc',
        varThree: '{% raw %}{{varOne}}{% endraw %}',
      };
      expect(resolveVariables(variables)).toEqual({
        varOne: 'abc',
        varThree: '{% raw %}{{varOne}}{% endraw %}',
      });
    });

    it('should leave placeholders nested in another expression untouched', () => {
      const variables = {
        varOne: 'abc',
        varTwo: "{{ '{{varOne}}' }}",
      };
      expect(resolveVariables(variables)).toEqual({
        varOne: 'abc',
        varTwo: "{{ '{{varOne}}' }}",
      });
    });

    it('should still substitute simple placeholders around protected spans', () => {
      const variables = {
        x: 'yes',
        mixed: '{{x}} and {% raw %}{{x}}{% endraw %}',
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        mixed: 'yes and {% raw %}{{x}}{% endraw %}',
      });
    });

    it('should leave an earlier raw-block occurrence untouched when the placeholder repeats', () => {
      const variables = {
        x: 'yes',
        mixed: '{% raw %}{{x}}{% endraw %} and {{x}}',
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        mixed: '{% raw %}{{x}}{% endraw %} and yes',
      });
    });

    it('should leave placeholders inside nested raw blocks untouched', () => {
      // Nunjucks balances nested raw blocks: the outer block stays open until
      // the matching endraw, so {{y}} here renders literally.
      const variables = {
        x: 'yes',
        y: 'no',
        nested: '{% raw %}{% raw %}{{x}}{% endraw %} {{y}}{% endraw %}',
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        y: 'no',
        nested: '{% raw %}{% raw %}{{x}}{% endraw %} {{y}}{% endraw %}',
      });
    });

    it('should protect an unterminated raw block through its last raw token', () => {
      // parseRaw swallows everything through the last raw/endraw token even
      // when the nesting never closes, so {{x}} stays literal while the
      // trailing {{y}} parses normally.
      const variables = {
        x: 'yes',
        y: 'no',
        nested: '{% raw %}{% raw %}{{x}}{% endraw %} {{y}}',
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        y: 'no',
        nested: '{% raw %}{% raw %}{{x}}{% endraw %} no',
      });
    });

    it('should still resolve placeholders after a lone unclosed raw tag', () => {
      // A {% raw %} with no further raw/endraw token is inert: Nunjucks
      // renders what follows as a normal template.
      const variables = {
        x: 'yes',
        v: '{% raw %}foo {{x}}',
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        v: '{% raw %}foo yes',
      });
    });

    it.each([
      ['balanced nested', '{% raw %}{% raw %}{{x}}{% endraw %} {{y}}{% endraw %}'],
      ['unterminated nested', '{% raw %}{% raw %}{{x}}{% endraw %} {{y}}'],
      ['lone unclosed', '{% raw %}foo {{x}}'],
      ['balanced then unclosed', '{% raw %}{{x}}{% endraw %} {% raw %}{{y}}'],
      ['quoted raw markers', "{{ '{% raw %}' }}{{x}}{{ '{% endraw %}' }}"],
    ])('should render %s raw blocks exactly like Nunjucks does', async (_name, template) => {
      const rendered = await renderPrompt(
        toPrompt('{{v}}'),
        { v: template, x: 'yes', y: 'no' },
        {},
      );
      const engine = getNunjucksEngine();
      expect(rendered).toBe(engine.renderString(template, { x: 'yes', y: 'no' }));
    });

    it('should leave quoted placeholders inside a concat expression untouched', () => {
      // The first quoted pair opens and closes before the second starts; a
      // lastIndexOf nesting check misses that and substitutes the second.
      const variables = {
        x: 'XVAL',
        y: 'YVAL',
        text: `{{ '{{x}}' ~ '{{y}}' }}`,
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'XVAL',
        y: 'YVAL',
        text: `{{ '{{x}}' ~ '{{y}}' }}`,
      });
    });

    it('should respect whitespace-control dashes on raw tags', () => {
      const variables = {
        x: 'XVAL',
        dashed: `{%- raw %}{{x}}{% endraw %}`,
        bothDashed: `{%- raw -%}{{x}}{%- endraw %}`,
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'XVAL',
        dashed: `{%- raw %}{{x}}{% endraw %}`,
        bothDashed: `{%- raw -%}{{x}}{%- endraw %}`,
      });
    });

    it('should substitute around a whitespace-controlled raw block', () => {
      const variables = {
        x: 'yes',
        mixed: `{%- raw %}{{x}}{% endraw %} and {{x}}`,
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'yes',
        mixed: `{%- raw %}{{x}}{% endraw %} and yes`,
      });
    });

    it('should render a raw-carrying var to literal text in a JSON prompt', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: '{% raw %}{{x}}{% endraw %}' },
        {},
      );
      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{x}}' }, null, 2));
    });

    it('should render a whitespace-controlled raw-carrying var to literal text', async () => {
      // `{%- raw %}` is a valid Nunjucks raw opener. The pre-render only treats a
      // value as protected when collectRawSpans sees a raw span; anchoring the
      // scan on '{%' plus whitespace misses the dash form, so the value is
      // passed through as data and the inner placeholder leaks. This is the
      // render-level guard for the same dashed-openner case resolveVariables
      // covers at the scanner level.
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: '{%- raw %}{{x}}{% endraw %}', x: 'XVAL' },
        {},
      );
      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{x}}' }, null, 2));
    });

    it('should render a concat-expression var exactly like Nunjucks in a JSON prompt', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: `{{ '{{x}}' ~ '{{y}}' }}`, x: 'XVAL', y: 'YVAL' },
        {},
      );
      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{x}}{{y}}' }, null, 2));
    });

    it('should ignore render failures in a value shadowed by a local set binding', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt("{% set v = 'ok' %}{{v}}"),
        { v: "{% set local = 'x' %}{{local | missing_filter}}" },
        {},
      );

      expect(renderedPrompt).toBe('ok');
    });

    it.each(['env', 'range'])(
      'should propagate errors from an explicit %s variable that shadows a global',
      async (globalName) => {
        await expect(
          renderPrompt(toPrompt(`{{${globalName}}}`), { [globalName]: '{% unknown %}' }, {}),
        ).rejects.toThrow('unknown block tag');
      },
    );

    it.each([
      ["{{ cycler('odd', 'even').next() }}", 'odd'],
      ["{{ joiner(',')('a','b') }}", ''],
    ])('should render the built-in global in %s as defined', async (template, expected) => {
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: template }, {});

      expect(renderedPrompt).toBe(expected);
    });

    it('should bind the implicit loop object in for-body dependencies', async () => {
      const template = '{% for item in items %}{{ loop.index ~ ":" ~ item }}{% endfor %}';
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: template, items: ['a', 'b'] },
        {},
      );

      expect(renderedPrompt).toBe('1:a2:b');
    });

    it.each([
      "{{ {'a': {'b': 1}} ~ '{% raw %}x{% endraw %}' }}",
      "{{ {'a': {'b': 1}} ~ '{# note #}' }}",
    ])('should track dictionary braces in protected-span scanners: %s', async (value) => {
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should collect distinct prompt references without reparsing once per symbol', async () => {
      const parser = (nunjucks as unknown as { parser: { parse: (template: string) => unknown } })
        .parser;
      const parseSpy = vi.spyOn(parser, 'parse');
      try {
        const value = Array.from({ length: 32 }, (_, index) => `{{ external${index} }}`).join(' ');
        await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

        expect(parseSpy.mock.calls.length).toBeLessThan(12);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('should keep the textual fallback linear after a parse failure', async () => {
      const parser = (nunjucks as unknown as { parser: { parse: (template: string) => unknown } })
        .parser;
      const parseSpy = vi.spyOn(parser, 'parse');
      try {
        const references = Array.from({ length: 32 }, (_, index) => `{{ external${index} }}`).join(
          ' ',
        );
        await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: `{{ broken ${references}` }, {});

        expect(parseSpy.mock.calls.length).toBeLessThan(12);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('should not clone the accumulated scope for every local assignment', async () => {
      const OriginalSet = globalThis.Set;
      let copiedElements = 0;
      const CountingSet = class extends OriginalSet {
        constructor(values?: any) {
          super(values);
          if (values) {
            copiedElements += values.size ?? values.length ?? 0;
          }
        }
      };
      vi.stubGlobal('Set', CountingSet);
      try {
        const value = Array.from(
          { length: 1000 },
          (_, index) => `{% set local${index} = 'x' %}`,
        ).join('');
        await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

        expect(copiedElements).toBeLessThan(5000);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should skip structural scans for template-free values in the full-render guard', async () => {
      const OriginalInt32Array = globalThis.Int32Array;
      let allocations = 0;
      const CountingInt32Array = new Proxy(OriginalInt32Array, {
        construct(target, args, newTarget) {
          allocations++;
          return Reflect.construct(target, args, newTarget);
        },
      });
      vi.stubGlobal('Int32Array', CountingInt32Array);
      try {
        const value = 'a'.repeat(16 * 1024 * 1024);
        const renderedPrompt = await renderPrompt(toPrompt('{{payload}}'), { payload: value }, {});

        expect(renderedPrompt).toBe(value);
        expect(allocations).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should not decode a literal nested inside another expression string', async () => {
      const value = `{{ name ~ "{{ 'x' }}" }}`;
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: value, name: 'defined' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should not start quote tracking on an apostrophe in plain text', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: `don't {{ '{{' }} {{x}}`, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: "don't {{ yes" }, null, 2));
    });

    it('should account for dictionary braces before consuming an expression closer', async () => {
      const value = "{{ {'outer': {'inner': 1}} ~ '{{' }} {{x}}";
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{v}}"}'),
        { v: value, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(
        JSON.stringify({ text: "{{ {'outer': {'inner': 1}} ~ '{{' }} yes" }, null, 2),
      );
    });

    it('should render a raw-carrying var to literal text when JSON autoescape is disabled', async () => {
      mockProcessEnv({ PROMPTFOO_DISABLE_JSON_AUTOESCAPE: 'true' });
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: '{% raw %}{{x}}{% endraw %}' },
        {},
      );
      expect(renderedPrompt).toBe('{{x}}');
      mockProcessEnv({ PROMPTFOO_DISABLE_JSON_AUTOESCAPE: undefined });
    });

    it('should not pre-render a var whose unprotected references are undefined', async () => {
      // x only appears inside the raw span, but y is genuinely referenced and
      // undefined, so the value must pass through untouched.
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: '{% raw %}{{x}}{% endraw %} {{y}}' },
        {},
      );
      expect(renderedPrompt).toBe(
        JSON.stringify({ text: '{% raw %}{{x}}{% endraw %} {{y}}' }, null, 2),
      );
    });

    it('should preserve a set target referenced by its own initializer when undefined', async () => {
      const value = '{% set x = x %}{{x}}';
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: value }, {});

      expect(renderedPrompt).toBe(value);
    });

    it('should render a quoted literal to text even when its inner variable is undefined', async () => {
      // x sits inside a quoted string in the expression, so it is not a real
      // reference; treating it as an undefined dependency would skip the
      // pre-render and leak the raw expression into the prompt.
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: "{{ '{{x}}' }}" },
        {},
      );
      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{x}}' }, null, 2));
    });

    it('should leave quoted placeholders inside block tags untouched', () => {
      const variables = {
        x: 'XVAL',
        v: "{% set literal = '{{x}}' %}{{literal}}",
      };
      expect(resolveVariables(variables)).toEqual({
        x: 'XVAL',
        v: "{% set literal = '{{x}}' %}{{literal}}",
      });
    });

    it('should render a block-tag quoted literal exactly like Nunjucks', async () => {
      const template = "{% set literal = '{{x}}' %}{{literal}}";
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: template, x: 'XVAL' }, {});
      expect(renderedPrompt).toBe(getNunjucksEngine().renderString(template, { x: 'XVAL' }));
    });

    it('should keep file-backed runtime values as data in JSON prompts', async () => {
      const restoreEnv = mockProcessEnv({ TEST_ENV_VAR: 'runtime-value-sentinel' });
      try {
        vi.spyOn(fs, 'readFileSync').mockReturnValueOnce('{{env.TEST_ENV_VAR}}');
        const renderedPrompt = await renderPrompt(
          toPrompt('{"text": "{{payload}}"}'),
          { payload: 'file://runtime-value.txt' },
          {},
        );

        expect(renderedPrompt).toBe(JSON.stringify({ text: '{{env.TEST_ENV_VAR}}' }, null, 2));
        expect(renderedPrompt).not.toContain('runtime-value-sentinel');
      } finally {
        restoreEnv();
      }
    });

    it('should keep file-backed runtime values as data when JSON autoescape is disabled', async () => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_DISABLE_JSON_AUTOESCAPE: 'true',
        TEST_ENV_VAR: 'runtime-value-sentinel',
      });
      try {
        vi.spyOn(fs, 'readFileSync').mockReturnValueOnce('{{env.TEST_ENV_VAR}}');
        const renderedPrompt = await renderPrompt(
          toPrompt('{{payload}}'),
          { payload: 'file://runtime-value.txt' },
          {},
        );

        expect(renderedPrompt).toBe('{{env.TEST_ENV_VAR}}');
      } finally {
        restoreEnv();
      }
    });

    it('should keep constructor calls as data beside protected literals in JSON prompts', async () => {
      const payload = '{% raw %}x{% endraw %}{{ range.constructor("return 6 * 7")() }}';
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{payload}}"}'),
        { payload },
        {},
      );

      expect(renderedPrompt).toBe(
        JSON.stringify({ text: 'x{{ range.constructor("return 6 * 7")() }}' }, null, 2),
      );
      expect(renderedPrompt).not.toContain('42');
    });

    it('should ignore raw contents when finding placeholders after a raw block', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: '{% raw %}{{{% endraw %} {{x}}', x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{ yes' }, null, 2));
    });

    it.each([
      ['inside', "{% raw %}don't {{x}}{% endraw %}"],
      ['before', "don't {% raw %}{{x}}{% endraw %}"],
    ])('should treat apostrophes %s a raw body as literal text', async (_name, value) => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: value, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: "don't {{x}}" }, null, 2));
    });

    it('should not execute a set-bound constructor beside protected literals', async () => {
      const payload =
        '{% set range = [] %}{% raw %}x{% endraw %}{{ range.constructor("return 6 * 7")() }}';
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{payload}}"}'),
        { payload },
        {},
      );

      expect(renderedPrompt).toBe(
        JSON.stringify(
          {
            text: '{% set range = [] %}x{{ range.constructor("return 6 * 7")() }}',
          },
          null,
          2,
        ),
      );
      expect(renderedPrompt).not.toContain('42');
    });

    it('should ignore set RHS literals when collecting external dependencies', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: "{% set greeting = 'Hello' %}{{ greeting ~ name }}", name: 'Ada' },
        {},
      );

      expect(renderedPrompt).toBe('HelloAda');
    });

    it('should preserve loop-local set dependencies', async () => {
      const template = '{% for item in items %}{% set label = item %}{{ label ~ "!" }}{% endfor %}';
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: template, items: ['a', 'b'] },
        {},
      );

      expect(renderedPrompt).toBe('a!b!');
    });

    it('should ignore comment contents when computing nesting depth', async () => {
      const template = '{# {{ #} {{x}}';
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: template, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(
        JSON.stringify({ text: getNunjucksEngine().renderString(template, { x: 'yes' }) }, null, 2),
      );
    });

    it('should preserve comment markers inside raw and quoted literals', async () => {
      const template = `{% raw %}{{x}}{# keep #}{% endraw %}{{ '{# keep #}' }}`;
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: template, x: 'ignored' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: '{{x}}{# keep #}{# keep #}' }, null, 2));
    });

    it('should ignore set tags inside comments when collecting external dependencies', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: '{# {% set local = missing %} #}hello' },
        {},
      );

      expect(renderedPrompt).toBe('hello');
    });

    it('should preserve whitespace-control dashes on set tags', async () => {
      const template = "{% set greeting = 'Hello' -%} {{ greeting }}";
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: template }, {});

      expect(renderedPrompt).toBe(getNunjucksEngine().renderString(template, {}));
    });

    it('should decode raw spans without evaluating a surrounding set program', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        {
          v: "{% set greeting = 'Hello' %}{% raw %}x{% endraw %}{{ greeting ~ name }}",
          name: 'Ada',
        },
        {},
      );

      expect(renderedPrompt).toBe(
        JSON.stringify({ text: "{% set greeting = 'Hello' %}x{{ greeting ~ name }}" }, null, 2),
      );
    });

    it('should not evaluate an env reference just because a value also has protected syntax', async () => {
      const restoreEnv = mockProcessEnv({ TEST_ENV_VAR: 'runtime-value-sentinel' });
      try {
        const renderedPrompt = await renderPrompt(
          toPrompt('{"text": "{{payload}}"}'),
          { payload: '{% raw %}{{x}}{% endraw %} {{env.TEST_ENV_VAR}}' },
          {},
        );

        expect(renderedPrompt).toContain('{{env.TEST_ENV_VAR}}');
        expect(renderedPrompt).not.toContain('runtime-value-sentinel');
      } finally {
        restoreEnv();
      }
    });

    it('should still render quoted environment placeholders as literals in JSON prompts', async () => {
      const restoreEnv = mockProcessEnv({ TEST_ENV_VAR: 'runtime-value-sentinel' });
      try {
        const renderedPrompt = await renderPrompt(
          toPrompt('{"text": "{{payload}}"}'),
          { payload: "{{ '{{env.TEST_ENV_VAR}}' }}" },
          {},
        );

        expect(renderedPrompt).toBe(JSON.stringify({ text: '{{env.TEST_ENV_VAR}}' }, null, 2));
      } finally {
        restoreEnv();
      }
    });

    it('should pass runtime values to third-party integrations without evaluating them', async () => {
      const restoreEnv = mockProcessEnv({ TEST_ENV_VAR: 'runtime-value-sentinel' });
      try {
        vi.mocked(getPortkeyPrompt).mockResolvedValue({
          model: 'gpt-4o',
          n: 1,
          top_p: 1,
          max_tokens: 128,
          temperature: 0.7,
          presence_penalty: 0,
          frequency_penalty: 0,
          messages: [{ role: 'user', content: 'hi' }],
        });
        vi.mocked(getLangfusePrompt).mockResolvedValue('langfuse result');
        vi.mocked(getHeliconePrompt).mockResolvedValue('helicone result');

        const vars = () => ({ payload: '{{env.TEST_ENV_VAR}}' });
        await renderPrompt(toPrompt('portkey://my-prompt'), vars(), {});
        await renderPrompt(toPrompt('langfuse://my-prompt'), vars(), {});
        await renderPrompt(toPrompt('helicone://my-prompt'), vars(), {});

        expect(getPortkeyPrompt).toHaveBeenCalledWith(
          'my-prompt',
          expect.objectContaining({ payload: '{{env.TEST_ENV_VAR}}' }),
        );
        expect(getLangfusePrompt).toHaveBeenCalledWith(
          'my-prompt',
          expect.objectContaining({ payload: '{{env.TEST_ENV_VAR}}' }),
          'text',
          undefined,
          undefined,
        );
        expect(getHeliconePrompt).toHaveBeenCalledWith(
          'my-prompt',
          expect.objectContaining({ payload: '{{env.TEST_ENV_VAR}}' }),
          undefined,
          undefined,
        );
      } finally {
        restoreEnv();
      }
    });

    it('should not fail a JSON prompt over an unreferenced unparseable var', async () => {
      // payload is never referenced by the prompt, so its invalid Nunjucks
      // must not abort the eval; it simply stays unused.
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: 'hello', payload: '{% unknown %}' },
        {},
      );
      expect(renderedPrompt).toBe(JSON.stringify({ text: 'hello' }, null, 2));
    });

    it('should fail a non-JSON prompt when a referenced var cannot render', async () => {
      await expect(renderPrompt(toPrompt('{{v}}'), { v: '{% unknown %}' }, {})).rejects.toThrow(
        'unknown block tag: unknown',
      );
    });

    it('should surface render errors for vars used through expression reads', async () => {
      await expect(
        renderPrompt(toPrompt("{{ v ~ 'tail' }}"), { v: '{% unknown %}' }, {}),
      ).rejects.toThrow('unknown block tag: unknown');
    });

    it('should surface render errors through transitive variable dependencies', async () => {
      await expect(
        renderPrompt(toPrompt('{{alias}}'), { alias: '{{v | safe}}', v: '{% unknown %}' }, {}),
      ).rejects.toThrow('unknown block tag: unknown');
    });

    it('should bind the implicit caller in macro-body dependencies', async () => {
      const template =
        '{% macro m() %}{{ caller() ~ "!" }}{% endmacro %}{% call m() %}x{% endcall %}';
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: template }, {});

      expect(renderedPrompt).toBe('x!');
    });

    it('should preserve an unterminated comment and its literal-looking suffix as data', async () => {
      const value = "{# {{ 'x' }}";
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should bound deep concatenation traversal without overflowing the stack', async () => {
      const value = `{{ ${'a ~ '.repeat(12000)}a }}`;
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it.each([
      ['addition', ' + '],
      ['subtraction', ' - '],
      ['multiplication', ' * '],
      ['division', ' / '],
      ['floor division', ' // '],
      ['remainder', ' % '],
      ['boolean and', ' and '],
      ['boolean or', ' or '],
    ])('should bound deep %s traversal without overflowing the stack', async (_label, operator) => {
      const value = `{{ ${`a${operator}`.repeat(12000)}a }}`;
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should bound deep postfix lookup traversal without overflowing the stack', async () => {
      const value = `{{ a${'.b'.repeat(6000)} }}`;
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should preserve render errors for referenced Unicode variable names', async () => {
      await expect(
        renderPrompt(toPrompt('{{ café }}'), { café: '{% unknown %}' }, {}),
      ).rejects.toThrow('unknown block tag: unknown');
    });

    it('should render an or fallback when its left operand is missing', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: "{{ user or 'anonymous' }}" },
        {},
      );

      expect(renderedPrompt).toBe('anonymous');
    });

    it('should apply an or fallback inside a parenthesized binary chain', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: "{{ (user or 'anonymous') ~ '!' }}" },
        {},
      );

      expect(renderedPrompt).toBe('anonymous!');
    });

    it('should retain a required name that also has an or-fallback occurrence', async () => {
      const value = "{{ user }} {{ user or 'anonymous' }}";
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: value }, {});

      expect(renderedPrompt).toBe(value);
    });

    it('should use complete Unicode names in the undefined-variable guard', async () => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{{v}}'),
        { v: '{{ café ~ "!" }}', café: 'hello' },
        {},
      );

      expect(renderedPrompt).toBe('hello!');
    });

    it('should bound wide external-context traversal without argument spreading', async () => {
      const value = '{{ 1 }}'.repeat(128000);
      const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

      expect(renderedPrompt).toBe(JSON.stringify({ text: value }, null, 2));
    });

    it('should bind super in block-body dependencies', async () => {
      const previousCwd = process.cwd();
      try {
        process.chdir(path.resolve('test/fixtures/nunjucks-include'));
        const value = '{% extends "base.njk" %}{% block body %}{{ super() ~ "!" }}{% endblock %}';
        const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: value }, {});

        const parentOutput = getNunjucksEngine().render('base.njk');
        expect(renderedPrompt).toBe(parentOutput.replace('B', 'B!'));
      } finally {
        process.chdir(previousCwd);
      }
    });

    it('should avoid quadratic scope snapshots for sibling macros', async () => {
      const OriginalSet = globalThis.Set;
      let copiedElements = 0;
      const CountingSet = class extends OriginalSet {
        constructor(values?: any) {
          super(values);
          if (values) {
            copiedElements += values.size ?? values.length ?? 0;
          }
        }
      };
      vi.stubGlobal('Set', CountingSet);
      try {
        const value = Array.from(
          { length: 6000 },
          (_, index) => `{% macro m${index}() %}x{% endmacro %}`,
        ).join('');
        const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value }, {});

        expect(renderedPrompt).toHaveLength(JSON.stringify({ text: value }, null, 2).length);
        expect(renderedPrompt).toContain('m5999');
        expect(copiedElements).toBeLessThan(20000);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it.each([
      ['include', '{% include "body.njk" %}'],
      ['import', '{% import "body.njk" as body %}'],
      ['from-import', '{% from "body.njk" import body %}'],
      ['extends', '{% extends "body.njk" %}'],
    ])(
      'should preserve render errors for variables consumed by an external template %s',
      async (_label, template) => {
        const previousCwd = process.cwd();
        try {
          process.chdir(path.resolve('test/fixtures/nunjucks-include'));
          await expect(
            renderPrompt(toPrompt(template), { v: '{% unknown %}' }, {}),
          ).rejects.toThrow('unknown block tag: unknown');
        } finally {
          process.chdir(previousCwd);
        }
      },
    );

    it('should preserve render errors for external templates reached through a variable', async () => {
      const previousCwd = process.cwd();
      try {
        process.chdir(path.resolve('test/fixtures/nunjucks-include'));
        await expect(
          renderPrompt(
            toPrompt('{{alias}}'),
            { alias: '{% include "body.njk" %}', v: '{% unknown %}' },
            {},
          ),
        ).rejects.toThrow('unknown block tag: unknown');
      } finally {
        process.chdir(previousCwd);
      }
    });

    it('should append dependency names without hitting the argument-count limit', async () => {
      const placeholders = Array.from({ length: 128000 }, (_, index) => `{{x${index}}}`);
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{v}}"}'),
        { v: `{% unknown %} ${placeholders.join(' ')}` },
        {},
      );

      expect(renderedPrompt).toContain('{% unknown %}');
      expect(renderedPrompt).toContain('{{x127999}}');
    });

    it.each([
      ['{{ r/"/ }} {{x}}', '{{ r/"/ }} yes'],
      ['{{ not r/"/ }} {{x}}', '{{ not r/"/ }} yes'],
      ['{% if r/"/ %}ok{% endif %} {{x}}', '{% if r/"/ %}ok{% endif %} yes'],
    ])(
      'should handle regex literals before starting quote tracking: %s',
      async (value, expected) => {
        const renderedPrompt = await renderPrompt(
          toPrompt('{"text":"{{v}}"}'),
          { v: value, x: 'yes' },
          {},
        );

        expect(renderedPrompt).toBe(JSON.stringify({ text: expected }, null, 2));
      },
    );

    it('should bound regex keyword lookup to the adjacent token', async () => {
      const entries = Array.from({ length: 8000 }, () => 'r/x/').join(', ');
      const value = `{{ [${entries}] }} {{x}}`;
      const originalSlice = String.prototype.slice;
      let slicedCharacters = 0;
      const sliceSpy = vi.spyOn(String.prototype, 'slice').mockImplementation(function (
        this: string,
        start?: number,
        end?: number,
      ) {
        const result = originalSlice.call(this, start, end);
        if (this.valueOf() === value && start === 0) {
          slicedCharacters += result.length;
        }
        return result;
      });
      try {
        const renderedPrompt = await renderPrompt(
          toPrompt('{"text":"{{v}}"}'),
          { v: value, x: 'yes' },
          {},
        );

        expect(renderedPrompt).toBe(JSON.stringify({ text: `{{ [${entries}] }} yes` }, null, 2));
        expect(slicedCharacters).toBeLessThan(100000);
      } finally {
        sliceSpy.mockRestore();
      }
    });

    it('should append fallback set RHS identifiers without argument spreading', async () => {
      const rhs = Array.from({ length: 128000 }, (_, index) => `identifier${index}`).join(' ');
      const value = `{% raw %}x{% endraw %}{% set local = ${rhs} %}`;
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{other}}"}'),
        { unused: value, other: 'ok' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: 'ok' }, null, 2));
    });

    it('should avoid rescanning failed regex literal suffixes', async () => {
      const entries = 'r/['.repeat(16000);
      const value = `{{ [${entries} }} {{x}}`;
      const startedAt = performance.now();
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{v}}"}'),
        { v: value, x: 'yes' },
        {},
      );
      const elapsed = performance.now() - startedAt;

      expect(renderedPrompt).toBe(JSON.stringify({ text: `{{ [${entries} }} yes` }, null, 2));
      expect(elapsed).toBeLessThan(1000);
    });

    it('should stop dependency expansion after falling back to all variables', async () => {
      const vars: Record<string, string> = Object.fromEntries(
        Array.from({ length: 4000 }, (_, index) => [`v${index}`, '{% unknown %}']),
      );
      const keysSpy = vi.spyOn(Object, 'keys');
      try {
        const renderedPrompt = await renderPrompt(toPrompt('{"text":"{{v0}}"}'), vars, {});
        expect(renderedPrompt).toBe(JSON.stringify({ text: '{% unknown %}' }, null, 2));
        const varsKeyReads = keysSpy.mock.calls.filter(([target]) => target === vars).length;
        expect(varsKeyReads).toBeLessThan(20);
      } finally {
        keysSpy.mockRestore();
      }
    }, 30_000);

    it('should avoid overlapping whitespace matching in the set fallback', async () => {
      const value = '{% raw %}x{% endraw %}{% set local = ' + ' '.repeat(64000);
      const startedAt = performance.now();
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{other}}"}'),
        { unused: value, other: 'ok' },
        {},
      );
      const elapsed = performance.now() - startedAt;

      expect(renderedPrompt).toBe(JSON.stringify({ text: 'ok' }, null, 2));
      expect(elapsed).toBeLessThan(1000);
    });

    it('should keep fallback tag prefix scanning deterministic', async () => {
      const value = `{% raw %}x{% endraw %}{%${' '.repeat(32000)}`;
      const startedAt = performance.now();
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{other}}"}'),
        { unused: value, other: 'ok' },
        {},
      );
      const elapsed = performance.now() - startedAt;

      expect(renderedPrompt).toBe(JSON.stringify({ text: 'ok' }, null, 2));
      expect(elapsed).toBeLessThan(1000);
    });

    it.each([
      ['{{ r/[ }} {{ r/"/ }} {{x}}', '{{ r/[ }} {{ r/"/ }} yes'],
      ['{{ [r/[ , r/"/] }} {{x}}', '{{ [r/[ , r/"/] }} yes'],
    ])('should preserve a valid regex after a failed probe: %s', async (value, expected) => {
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text":"{{v}}"}'),
        { v: value, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: expected }, null, 2));
    });

    it('should honor escaped quotes in protected literal expressions', async () => {
      const template = "{{ 'it\\'s' }} {{x}}";
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: template, x: 'yes' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: "it's yes" }, null, 2));
      expect(renderedPrompt).toBe(
        JSON.stringify({ text: getNunjucksEngine().renderString(template, { x: 'yes' }) }, null, 2),
      );
    });

    it('should ignore raw markers after escaped quotes in literal expressions', async () => {
      const template = "{{ 'it\\'s {% raw %}' ~ name }}";
      const renderedPrompt = await renderPrompt(
        toPrompt('{"text": "{{v}}"}'),
        { v: template, name: 'Ada' },
        {},
      );

      expect(renderedPrompt).toBe(JSON.stringify({ text: template }, null, 2));
    });

    it('should exclude callable test names from set RHS dependencies', async () => {
      const template = "{% set even = n is divisibleby(2) %}{{ 'even' if even else 'odd' }}";
      const renderedPrompt = await renderPrompt(toPrompt('{{v}}'), { v: template, n: 4 }, {});

      expect(renderedPrompt).toBe('even');
    });

    it('should check render failures against the prompt returned by a function', async () => {
      const prompt = {
        ...toPrompt('function source'),
        function: async () => '{{v}}',
      };
      await expect(renderPrompt(prompt, { v: '{% unknown %}' }, {})).rejects.toThrow(
        'unknown block tag: unknown',
      );
    });

    it('should pass pre-rendered vars to third-party prompt integrations', async () => {
      vi.mocked(getPortkeyPrompt).mockResolvedValue({
        model: 'gpt-4o',
        n: 1,
        top_p: 1,
        max_tokens: 128,
        temperature: 0.7,
        presence_penalty: 0,
        frequency_penalty: 0,
        messages: [{ role: 'user', content: 'hi' }],
      });
      vi.mocked(getLangfusePrompt).mockResolvedValue('langfuse result');
      vi.mocked(getHeliconePrompt).mockResolvedValue('helicone result');

      const vars = () => ({ v: '{% raw %}{{x}}{% endraw %}', x: 'ignored' });
      await renderPrompt(toPrompt('portkey://my-prompt'), vars(), {});
      await renderPrompt(toPrompt('langfuse://my-prompt'), vars(), {});
      await renderPrompt(toPrompt('helicone://my-prompt'), vars(), {});

      expect(getPortkeyPrompt).toHaveBeenCalledWith(
        'my-prompt',
        expect.objectContaining({ v: '{{x}}' }),
      );
      expect(getLangfusePrompt).toHaveBeenCalledWith(
        'my-prompt',
        expect.objectContaining({ v: '{{x}}' }),
        'text',
        undefined,
        undefined,
      );
      expect(getHeliconePrompt).toHaveBeenCalledWith(
        'my-prompt',
        expect.objectContaining({ v: '{{x}}' }),
        undefined,
        undefined,
      );
    });

    it('should preserve raw variables to integrations when templating is disabled', async () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
      try {
        vi.mocked(getPortkeyPrompt).mockResolvedValue({
          model: 'gpt-4o',
          n: 1,
          top_p: 1,
          max_tokens: 128,
          temperature: 0.7,
          presence_penalty: 0,
          frequency_penalty: 0,
          messages: [{ role: 'user', content: 'hi' }],
        });
        const rawValue = '{% raw %}{{x}}{% endraw %}';

        await renderPrompt(toPrompt('portkey://my-prompt'), { v: rawValue }, {});

        expect(getPortkeyPrompt).toHaveBeenCalledWith(
          'my-prompt',
          expect.objectContaining({ v: rawValue }),
        );
      } finally {
        restoreEnv();
      }
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

        it('should restore the prompt function dropped by JSON serialization (issue #9653)', async () => {
          // A file://...:fn prompt carries a non-serializable `function`. When the
          // suite round-trips through a Python/JS hook (JSON), `function` is lost.
          const promptFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                {
                  raw: 'def create_prompt(): ...',
                  label: 'prompt.py:create_prompt',
                  function: promptFn,
                },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          // Simulate the serialized round-trip: the hook returns the same prompt
          // without its `function`.
          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [{ raw: 'def create_prompt(): ...', label: 'prompt.py:create_prompt' }],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts).toHaveLength(1);
          expect(out.suite.prompts[0].function).toBe(promptFn);
        });

        it('should not restore a function when the hook rewrites the prompt raw source', async () => {
          const promptFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'original source', label: 'prompt.py:create_prompt', function: promptFn },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          // The hook intentionally replaces the prompt with a new raw string and no
          // function — its new behavior must be preserved.
          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [{ raw: 'rewritten source', label: 'prompt.py:create_prompt' }],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts[0].raw).toBe('rewritten source');
          expect(out.suite.prompts[0].function).toBeUndefined();
        });

        it('should not restore either function when two originals share a label, and should warn', async () => {
          const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
          const fnA = vi.fn();
          const fnB = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'source A', label: 'shared-label', function: fnA },
                { raw: 'source B', label: 'shared-label', function: fnB },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [
                { raw: 'source A', label: 'shared-label' },
                { raw: 'source B', label: 'shared-label' },
              ],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts[0].function).toBeUndefined();
          expect(out.suite.prompts[1].function).toBeUndefined();
          expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('shared-label'));
          warnSpy.mockRestore();
        });

        it('should keep a function the hook itself attached instead of overwriting it', async () => {
          const originalFn = vi.fn();
          const hookFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'prompt.py:fn', function: originalFn },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          // An in-process JS hook can return live objects; a function it attached
          // deliberately must win over restoration.
          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'prompt.py:fn', function: hookFn },
              ],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts[0].function).toBe(hookFn);
        });

        it('should restore the function across multiple chained extensions', async () => {
          const promptFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'prompt.py:fn', function: promptFn },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          // Both extensions round-trip the suite through JSON, dropping the function
          // each time. Restoration after the first hook feeds the second hook's
          // originals, so the function must survive the whole chain.
          const serializedSuite = {
            suite: {
              providers: fnContext.suite.providers,
              prompts: [{ raw: 'def create_prompt(): ...', label: 'prompt.py:fn' }],
              tests: fnContext.suite.tests,
            },
          };
          vi.mocked(transform)
            .mockResolvedValueOnce(serializedSuite)
            .mockResolvedValueOnce(serializedSuite);

          const out = await runExtensionHook(['ext1', 'ext2'], hookName, fnContext);

          expect(transform).toHaveBeenCalledTimes(2);
          expect(out.suite.prompts[0].function).toBe(promptFn);
        });

        it('should warn when the hook returns a function prompt under a different label', async () => {
          const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
          const promptFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'old-label', function: promptFn },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [{ raw: 'def create_prompt(): ...', label: 'new-label' }],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts[0].function).toBeUndefined();
          expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('old-label'));
          warnSpy.mockRestore();
        });

        it('should pass through malformed prompt entries without throwing', async () => {
          const promptFn = vi.fn();
          const fnContext = {
            suite: {
              providers: [mockApiProvider],
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'prompt.py:fn', function: promptFn },
              ],
              tests: [{ vars: {} }],
            } as TestSuite,
          };

          // Hooks return arbitrary deserialized JSON; malformed entries must pass
          // through untouched while valid matches are still restored.
          vi.mocked(transform).mockResolvedValue({
            suite: {
              providers: fnContext.suite.providers,
              prompts: [
                { raw: 'def create_prompt(): ...', label: 'prompt.py:fn' },
                null,
                'just a string',
                { raw: 'no label here' },
              ],
              tests: fnContext.suite.tests,
            },
          });

          const out = await runExtensionHook(['ext1'], hookName, fnContext);

          expect(out.suite.prompts).toHaveLength(4);
          expect(out.suite.prompts[0].function).toBe(promptFn);
          expect(out.suite.prompts[1]).toBeNull();
          expect(out.suite.prompts[2]).toBe('just a string');
          expect(out.suite.prompts[3]).toEqual({ raw: 'no label here' });
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

      it('should chain multiple beforeAll extensions so each sees prior changes', async () => {
        const baseTests = [{ vars: { original: 'yes' } }];
        const chainContext = {
          suite: {
            providers: [mockApiProvider],
            prompts: [toPrompt('Test prompt')],
            tests: baseTests,
          } as TestSuite,
        };

        vi.mocked(transform)
          .mockResolvedValueOnce({
            suite: {
              providers: chainContext.suite.providers,
              prompts: chainContext.suite.prompts,
              tests: [...baseTests, { vars: { added_by_ext1: 'yes' } }],
            },
          })
          .mockImplementationOnce(async (_ext, context) => {
            // Extension #2 should see the tests array modified by extension #1
            const ctx = context as { suite: TestSuite };
            expect(ctx.suite.tests).toHaveLength(2);
            expect(ctx.suite.tests?.[1]).toEqual({ vars: { added_by_ext1: 'yes' } });
            return {
              suite: {
                providers: ctx.suite.providers,
                prompts: ctx.suite.prompts,
                tests: [...(ctx.suite.tests || []), { vars: { added_by_ext2: 'yes' } }],
              },
            };
          });

        const out = await runExtensionHook(
          ['file://ext1.js:beforeAll', 'file://ext2.js:beforeAll'],
          'beforeAll',
          chainContext,
        );
        expect(out.suite.tests).toHaveLength(3);
        expect(out.suite.tests?.[0]).toEqual({ vars: { original: 'yes' } });
        expect(out.suite.tests?.[1]).toEqual({ vars: { added_by_ext1: 'yes' } });
        expect(out.suite.tests?.[2]).toEqual({ vars: { added_by_ext2: 'yes' } });
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

    describe('afterEach return value handling', () => {
      const baseResult = {
        provider: { id: () => 'test' } as any,
        prompt: { raw: 'test', label: 'test' } as any,
        vars: {},
        response: { output: 'test output' } as any,
        success: true,
        score: 1,
        latencyMs: 100,
        namedScores: { existing_metric: 0.5 },
        metadata: { existing_key: 'value' },
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        cost: 0,
      } as any;

      it('should merge returned namedScores into the result', async () => {
        vi.mocked(transform).mockResolvedValue({
          test: {} as TestCase,
          result: {
            namedScores: { num_turns: 3, cost_usd: 0.05 },
          },
        });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        expect(out.result.namedScores).toEqual({
          existing_metric: 0.5,
          num_turns: 3,
          cost_usd: 0.05,
        });
      });

      it('should merge returned metadata into the result', async () => {
        vi.mocked(transform).mockResolvedValue({
          test: {} as TestCase,
          result: {
            metadata: { session_url: 'https://example.com', tool_calls: 5 },
          },
        });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        expect(out.result.metadata).toEqual({
          existing_key: 'value',
          session_url: 'https://example.com',
          tool_calls: 5,
        });
      });

      it('should merge returned response.metadata into the result', async () => {
        vi.mocked(transform).mockResolvedValue({
          test: {} as TestCase,
          result: {
            response: { metadata: { session_viewer: 'https://viewer.example.com', tool_count: 3 } },
          },
        });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        expect(out.result.response?.metadata).toEqual({
          session_viewer: 'https://viewer.example.com',
          tool_count: 3,
        });
        // Other response fields should be preserved
        expect(out.result.response?.output).toBe('test output');
      });

      it('should preserve existing namedScores and metadata when extension returns none', async () => {
        vi.mocked(transform).mockResolvedValue(undefined);

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        expect(out.result.namedScores).toEqual({ existing_metric: 0.5 });
        expect(out.result.metadata).toEqual({ existing_key: 'value' });
      });

      it('should chain multiple extensions correctly', async () => {
        vi.mocked(transform)
          .mockResolvedValueOnce({
            test: {} as TestCase,
            result: {
              namedScores: { metric_a: 1 },
              metadata: { key_a: 'a' },
            },
          })
          .mockResolvedValueOnce({
            test: {} as TestCase,
            result: {
              namedScores: { metric_b: 2 },
              metadata: { key_b: 'b' },
            },
          });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(
          ['file://hooks1.js:afterEach', 'file://hooks2.js:afterEach'],
          'afterEach',
          context,
        );
        expect(out.result.namedScores).toEqual({
          existing_metric: 0.5,
          metric_a: 1,
          metric_b: 2,
        });
        expect(out.result.metadata).toEqual({
          existing_key: 'value',
          key_a: 'a',
          key_b: 'b',
        });
      });

      it('should allow later extensions to override earlier extension values', async () => {
        vi.mocked(transform)
          .mockResolvedValueOnce({
            test: {} as TestCase,
            result: {
              namedScores: { shared_metric: 1 },
            },
          })
          .mockResolvedValueOnce({
            test: {} as TestCase,
            result: {
              namedScores: { shared_metric: 99 },
            },
          });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(
          ['file://hooks1.js:afterEach', 'file://hooks2.js:afterEach'],
          'afterEach',
          context,
        );
        expect(out.result.namedScores.shared_metric).toBe(99);
      });

      it('should filter non-numeric namedScores values', async () => {
        vi.mocked(transform).mockResolvedValue({
          test: {} as TestCase,
          result: {
            namedScores: {
              valid_int: 42,
              valid_float: 3.14,
              valid_zero: 0,
              valid_negative: -5,
              string_val: 'not_a_number' as any,
              null_val: null as any,
              array_val: [1, 2] as any,
              object_val: { nested: true } as any,
              nan_val: NaN,
              infinity_val: Infinity,
              neg_infinity_val: -Infinity,
            },
          },
        });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        // Only finite numeric values should survive
        expect(out.result.namedScores).toEqual({
          existing_metric: 0.5,
          valid_int: 42,
          valid_float: 3.14,
          valid_zero: 0,
          valid_negative: -5,
        });
      });

      it('should not allow overriding success, score, or response.output via return value', async () => {
        vi.mocked(transform).mockResolvedValue({
          test: {} as TestCase,
          result: {
            namedScores: { custom: 1 },
            success: false,
            score: 0,
            response: { output: 'hacked', metadata: { injected: true } },
          },
        });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(['file://hooks.js:afterEach'], 'afterEach', context);
        // success and score should remain unchanged
        expect(out.result.success).toBe(true);
        expect(out.result.score).toBe(1);
        // response.output should remain unchanged
        expect(out.result.response?.output).toBe('test output');
        // but namedScores and response.metadata should be merged
        expect(out.result.namedScores.custom).toBe(1);
        expect(out.result.response?.metadata?.injected).toBe(true);
      });

      it('should pass accumulated context to subsequent extensions (chaining input)', async () => {
        // Extension #2 should receive the context modified by extension #1
        vi.mocked(transform)
          .mockImplementationOnce(async (_ext, context) => {
            // Extension #1: verify it gets the original context, return new namedScores
            const ctx = context as AfterEachExtensionHookContext;
            expect(ctx.result.namedScores).toEqual({ existing_metric: 0.5 });
            return {
              test: ctx.test,
              result: {
                namedScores: { from_ext1: 10 },
              },
            };
          })
          .mockImplementationOnce(async (_ext, context) => {
            // Extension #2: should see extension #1's merged namedScores in input
            const ctx = context as AfterEachExtensionHookContext;
            expect(ctx.result.namedScores).toEqual({
              existing_metric: 0.5,
              from_ext1: 10,
            });
            return {
              test: ctx.test,
              result: {
                namedScores: { from_ext2: 20 },
              },
            };
          });

        const context = {
          test: {} as TestCase,
          result: { ...baseResult },
        };

        const out = await runExtensionHook(
          ['file://hooks1.js:afterEach', 'file://hooks2.js:afterEach'],
          'afterEach',
          context,
        );
        expect(out.result.namedScores).toEqual({
          existing_metric: 0.5,
          from_ext1: 10,
          from_ext2: 20,
        });
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

    it('preserves Ogg video metadata for existing evaluations', () => {
      expect(collectFileMetadata({ clip: 'file://clip.ogg' })).toEqual({
        clip: { path: 'file://clip.ogg', type: 'video', format: 'ogg' },
      });
    });

    it('should identify video files correctly', () => {
      const vars = {
        video1: 'file://path/to/video.mp4',
        video2: 'file://path/to/video.webm',
        video3: 'file://path/to/video.mkv',
        video4: 'file://path/to/video.ogg',
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
        video4: {
          path: 'file://path/to/video.ogg',
          type: 'video',
          format: 'ogg',
        },
      });
    });

    it('should identify audio files correctly', () => {
      const vars = {
        audio1: 'file://path/to/audio.mp3',
        audio2: 'file://path/to/audio.wav',
        audio3: 'file://path/to/audio.flac',
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
        audio3: {
          path: 'file://path/to/audio.flac',
          type: 'audio',
          format: 'flac',
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

    it.each([
      ['heic', 'image/heic'],
      ['heif', 'image/heif'],
      ['avif', 'image/avif'],
      ['tif', 'image/tiff'],
      ['tiff', 'image/tiff'],
    ])('should generate a data URL for %s images', async (extension, mimeType) => {
      const prompt = toPrompt('Test prompt with image: {{image}}');
      const renderedPrompt = await renderPrompt(prompt, {
        image: `file://test-image.${extension}`,
      });

      expect(renderedPrompt).toContain(`data:${mimeType};base64,`);
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

    it.each(['mp4', 'mpeg', 'mpg', 'mov', 'avi', 'flv', 'webm', 'wmv', '3gp', '3gpp'])(
      'should load %s video files as raw base64',
      async (extension) => {
        vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
          return Buffer.from('test-video-content');
        });

        const prompt = toPrompt('Test prompt with video: {{video}}');
        const renderedPrompt = await renderPrompt(prompt, {
          video: `file://test-video.${extension}`,
        });

        // Should NOT have data: prefix for videos
        expect(renderedPrompt).not.toContain('data:video');
        expect(renderedPrompt).toContain('dGVzdC12aWRlby1jb250ZW50'); // base64 of 'test-video-content'
      },
    );

    it.each(['mp3', 'wav', 'm4a', 'aif', 'aiff', 'aifc', 'aac', 'ogg', 'flac'])(
      'should load %s audio files as raw base64',
      async (extension) => {
        vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
          return Buffer.from('test-audio-content');
        });

        const prompt = toPrompt('Test prompt with audio: {{audio}}');
        const renderedPrompt = await renderPrompt(prompt, {
          audio: `file://test-audio.${extension}`,
        });

        // Should NOT have data: prefix for audio
        expect(renderedPrompt).not.toContain('data:audio');
        expect(renderedPrompt).toContain('dGVzdC1hdWRpby1jb250ZW50'); // base64 of 'test-audio-content'
      },
    );

    it.each(['m4a', 'M4A', 'M4a'])(
      'should preserve raw audio data in native templates for .%s',
      async (extension) => {
        vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
          return Buffer.from('test-audio-content');
        });

        const prompt = toPrompt(
          '[{"role":"user","parts":[{"inlineData":{"mimeType":"audio/mp4","data":"{{audio}}"}}]}]',
        );
        const renderedPrompt = await renderPrompt(prompt, {
          audio: `file://test-audio.${extension}`,
        });

        expect(JSON.parse(renderedPrompt)[0].parts[0].inlineData).toEqual({
          mimeType: 'audio/mp4',
          data: 'dGVzdC1hdWRpby1jb250ZW50',
        });
      },
    );

    it.each(['https://example.com/api', 'file://custom-provider.js', 'openai:gpt-5.6'])(
      'keeps M4A variables as raw base64 for %s',
      async (id) => {
        vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('test-audio-content'));
        const rendered = await renderPrompt(
          toPrompt('{{audio}}'),
          { audio: 'file://test-audio.m4a' },
          undefined,
          createMockProvider({ id }),
        );
        expect(rendered).toBe('dGVzdC1hdWRpby1jb250ZW50');
      },
    );

    it('keeps M4A variables as raw base64 for non-Gemini Google models', async () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('test-audio-content'));
      const rendered = await renderPrompt(
        toPrompt('{{audio}}'),
        { audio: 'file://test-audio.m4a' },
        undefined,
        new AIStudioChatProvider('chat-bison'),
      );
      expect(rendered).toBe('dGVzdC1hdWRpby1jb250ZW50');
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

  describe('structural dependency guards', () => {
    it('does not treat quoted raw markers as real spans that hide a missing dependency', async () => {
      const value = "{{ '{% raw %}' }}{{missing}}{{ '{% endraw %}' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: value })).toBe(value);
    });

    it('strips many unclosed comments without repeated tail scans', async () => {
      const value = '{{ "ok" }}' + '{#'.repeat(64000);
      const rendered = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value });
      expect(JSON.parse(rendered).text).toBe('ok' + '{#'.repeat(64000));
    }, 15000);

    it('allows missing operands in defined and undefined tests', async () => {
      expect(await renderPrompt(toPrompt('{{v}}'), { v: '{{ user is defined }}' })).toBe('false');
      expect(await renderPrompt(toPrompt('{{v}}'), { v: '{{ user is undefined }}' })).toBe('true');
    });

    it('renders an existence-guarded inline fallback', async () => {
      const rendered = await renderPrompt(toPrompt('{{v}}'), {
        v: "{{ user if user is defined else 'anonymous' }}",
      });
      expect(rendered).toBe('anonymous');
    });

    it('protects verbatim bodies without nesting later placeholders', async () => {
      const value = '{% verbatim %}{{% endverbatim %} {{x}}';
      expect(await renderPrompt(toPrompt('{{v}}'), { v: value, x: 'yes' })).toBe('{ yes');
    });

    it('collects dependencies through deep function-call chains without overflowing', async () => {
      const value = '{{ a' + '()'.repeat(6000) + ' }}';
      const rendered = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value });
      expect(JSON.parse(rendered).text).toBe(value);
    }, 15000);

    it('collects dependencies through alternating lookup and call chains without overflowing', async () => {
      const value = '{{ a' + '.b()'.repeat(6000) + ' }}';
      const rendered = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value });
      expect(JSON.parse(rendered).text).toBe(value);
    }, 15000);

    it('bounds macro call-site analysis across a shared dependency DAG', async () => {
      const value =
        Array.from({ length: 26 }, (_, index) =>
          index === 0
            ? '{% macro m0() %}x{% endmacro %}'
            : `{% macro m${index}() %}{{m${index - 1}()}}{{m${index - 1}()}}{% endmacro %}`,
        ).join('') + '{{m25()}}';
      const rendered = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value });
      expect(JSON.parse(rendered).text).toBe(value);
    }, 15000);

    it('bounds deferred macro chains without expanding them quadratically', async () => {
      const value = Array.from({ length: 1000 }, (_, index) =>
        index === 0
          ? '{% macro m0() %}x{% endmacro %}'
          : `{% macro m${index}() %}{{m${index - 1}()}}{% endmacro %}`,
      ).join('');
      const rendered = await renderPrompt(toPrompt('{"text":"{{v}}"}'), { v: value });
      expect(JSON.parse(rendered).text).toBe(value);
    }, 15000);

    it('retains deep dependencies beyond the macro expansion limit', async () => {
      const value =
        Array.from({ length: 1000 }, (_, index) =>
          index === 0
            ? '{% macro m0() %}{{missing}}{% endmacro %}'
            : `{% macro m${index}() %}{{m${index - 1}()}}{% endmacro %}`,
        ).join('') + '{{m999()}}';
      expect(await renderPrompt(toPrompt('{{v}}'), { v: value })).toBe(value);
    }, 15000);

    it('does not leak caller macro locals into nested macro dependencies', async () => {
      const value =
        "{% macro b() %}{{y}}{% endmacro %}{% macro a(y='local') %}{{b()}}{% endmacro %}{{a()}}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: value })).toBe(value);
    });

    it('resolves deferred macro reads against bindings present at each call', async () => {
      const afterSet = "{% macro m() %}{{ s ~ '!' }}{% endmacro %}{% set s = 'a' %}{{ m() ~ '' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: afterSet })).toBe('a!');

      const beforeSet = '{% macro m() %}{{s}}{% endmacro %}{{m()}}{% set s = "a" %}';
      expect(await renderPrompt(toPrompt('{{v}}'), { v: beforeSet })).toBe(beforeSet);

      const defaultAfterSet = '{% macro m(x=s) %}{{x}}{% endmacro %}{% set s = "a" %}{{m()}}';
      expect(await renderPrompt(toPrompt('{{v}}'), { v: defaultAfterSet })).toBe('a');
    });

    it('excludes macro defaults bypassed by supplied call arguments', async () => {
      const supplied = "{% macro m(x=missing) %}{{ x ~ '!' }}{% endmacro %}{{ m(x='hello') ~ '' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: supplied })).toBe('hello!');

      const repeated = supplied + "{{ m(x='again') ~ '' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: repeated })).toBe('hello!again!');

      const laterMissing = supplied + "{{ m() ~ '' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: laterMissing })).toBe(laterMissing);

      const mixed =
        "{% macro m(x=missing, y=alsoMissing) %}{{ x ~ y }}{% endmacro %}{{ m('a', y='b') }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: mixed })).toBe('ab');

      const partial =
        "{% macro m(x=missing, y=alsoMissing) %}{{ x ~ y }}{% endmacro %}{{ m('a') }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: partial })).toBe(partial);
    });

    it('carries bindings guaranteed by both conditional branches', async () => {
      const bothBranches =
        "{% if enabled %}{% set s='a' %}{% else %}{% set s='b' %}{% endif %}{{ s ~ '!' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: bothBranches, enabled: true })).toBe('a!');
      expect(await renderPrompt(toPrompt('{{v}}'), { v: bothBranches, enabled: false })).toBe('b!');

      const oneBranch = "{% if enabled %}{% set s='a' %}{% endif %}{{ s ~ '!' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: oneBranch, enabled: true })).toBe(
        oneBranch,
      );

      const elif =
        "{% if first %}{% set s='a' %}{% elif second %}{% set s='b' %}{% else %}{% set s='c' %}{% endif %}{{ s ~ '!' }}";
      expect(
        await renderPrompt(toPrompt('{{v}}'), {
          v: elif,
          first: false,
          second: false,
        }),
      ).toBe('c!');

      const existence =
        "{% if user is defined %}{% set s='a' %}{% else %}{% set s='b' %}{% endif %}{{ s ~ '!' }}";
      expect(await renderPrompt(toPrompt('{{v}}'), { v: existence })).toBe('b!');
    });
  });
});
