import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  maybeLoadToolsFromExternalFile,
  parsePathOrGlob,
  readFilters,
  readOutput,
} from '../../src/util/index';
import { TestGrader } from './utils';

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(),
  hasMagic: (path: string) => {
    // Match the real hasMagic behavior: only detect patterns in forward-slash paths
    // This mimics glob's actual behavior where backslash paths return false
    return /[*?[\]{}]/.test(path) && !path.includes('\\');
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
}));

// Import after mocking
import { importModule } from '../../src/esm';

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

describe('maybeLoadToolsFromExternalFile', () => {
  const mockFileContent = '{"name": "calculator", "parameters": {"type": "object"}}';
  const mockToolsArray = [
    { type: 'function', function: { name: 'calculator', parameters: { type: 'object' } } },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should process tool objects directly', async () => {
    const tools = mockToolsArray;
    const vars = { api_key: '123456' };
    expect(await maybeLoadToolsFromExternalFile(tools, vars)).toEqual(tools);
  });

  it('should load tools from external file', async () => {
    const tools = 'file://tools.json';
    expect(await maybeLoadToolsFromExternalFile(tools)).toEqual(JSON.parse(mockFileContent));
  });

  it('should render variables in tools object', async () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'calculator',
          parameters: { type: 'object' },
          apiKey: '{{ api_key }}',
        },
      },
    ];
    const vars = { api_key: '123456' };

    const expected = [
      {
        type: 'function',
        function: {
          name: 'calculator',
          parameters: { type: 'object' },
          apiKey: '123456',
        },
      },
    ];

    expect(await maybeLoadToolsFromExternalFile(tools, vars)).toEqual(expected);
  });

  it('should render variables and load from external file', async () => {
    const tools = 'file://{{ file_path }}.json';
    const vars = { file_path: 'tools' };

    maybeLoadToolsFromExternalFile(tools, vars);

    // Should resolve the file path with variables first
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
  });

  it('should handle array of file paths', async () => {
    const tools = ['file://tools1.json', 'file://tools2.json'];

    await maybeLoadToolsFromExternalFile(tools);

    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  describe('validation', () => {
    it('should throw error for Python/JS/TS file with function name when file not found', async () => {
      // Test with Python file (naturally fails - no mocking needed)
      const pythonTools = 'file://nonexistent.py:get_tools';
      await expect(maybeLoadToolsFromExternalFile(pythonTools)).rejects.toThrow(
        /Failed to load tools/,
      );

      // Test with JavaScript file (naturally fails when require() can't find the module)
      const jsTools = 'file://nonexistent.js:getTools';
      await expect(maybeLoadToolsFromExternalFile(jsTools)).rejects.toThrow(/Failed to load tools/);

      // Test with TypeScript file (naturally fails when import can't find the module)
      const tsTools = 'file://nonexistent.ts:getTools';
      await expect(maybeLoadToolsFromExternalFile(tsTools)).rejects.toThrow(/Failed to load tools/);
    });

    it('should throw error for Python file without function name', async () => {
      // Python file without function name requires a function name
      const tools = 'file://tools.py';

      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /Python files require a function name/,
      );
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /file:\/\/tools\.py:get_tools/,
      );
    });

    it('should throw error for JavaScript file without function name', async () => {
      // JavaScript file without function name requires a function name
      const tools = 'file://tools.js';

      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /JavaScript files require a function name/,
      );
    });

    it('should throw error for invalid string content', async () => {
      // Simulate a text file being loaded
      const textContent = 'this is not valid JSON or YAML';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(textContent);

      const tools = 'file://tools.txt';

      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /expected an array or object, but got a string/,
      );
    });

    it('should accept valid YAML tools', async () => {
      const yamlContent = `- type: function
  function:
    name: test
    parameters:
      type: object`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);

      const tools = 'file://tools.yaml';
      const result = await maybeLoadToolsFromExternalFile(tools);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].type).toBe('function');
    });

    it('should accept valid JSON tools', async () => {
      const jsonContent = JSON.stringify([
        { type: 'function', function: { name: 'test', parameters: { type: 'object' } } },
      ]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(jsonContent);

      const tools = 'file://tools.json';
      const result = await maybeLoadToolsFromExternalFile(tools);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].type).toBe('function');
    });

    it('should accept inline tool objects', async () => {
      const tools = [{ type: 'function', function: { name: 'test' } }];
      const result = await maybeLoadToolsFromExternalFile(tools);
      expect(result).toEqual(tools);
    });

    it('should return undefined for undefined input', async () => {
      const result = await maybeLoadToolsFromExternalFile(undefined);
      expect(result).toBeUndefined();
    });

    it('should return null for null input', async () => {
      const result = await maybeLoadToolsFromExternalFile(null);
      expect(result).toBeNull();
    });

    it('should reject number return types from functions', async () => {
      const mockedImportModule = vi.mocked(importModule);
      mockedImportModule.mockResolvedValue({
        getTools: () => 42,
      });

      const tools = 'file://tools.js:getTools';
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /must return an array or object/,
      );
    });

    it('should reject boolean return types from functions', async () => {
      const mockedImportModule = vi.mocked(importModule);
      mockedImportModule.mockResolvedValue({
        getTools: () => true,
      });

      const tools = 'file://tools.js:getTools';
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /must return an array or object/,
      );
    });

    it('should handle async function exports from JS files', async () => {
      const mockedImportModule = vi.mocked(importModule);
      const expectedTools = [{ type: 'function', function: { name: 'asyncTool' } }];
      mockedImportModule.mockResolvedValue({
        getTools: async () => expectedTools,
      });

      const tools = 'file://tools.js:getTools';
      const result = await maybeLoadToolsFromExternalFile(tools);

      expect(result).toEqual(expectedTools);
    });

    it('should show empty exports message when no functions available', async () => {
      const mockedImportModule = vi.mocked(importModule);
      mockedImportModule.mockResolvedValue({
        default: {},
      });

      const tools = 'file://tools.js:getTools';
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
        /Available exports: \(none\)/,
      );
    });

    it('should handle JavaScript syntax errors gracefully', async () => {
      const mockedImportModule = vi.mocked(importModule);
      const syntaxError = new SyntaxError('Unexpected token )');
      mockedImportModule.mockRejectedValue(syntaxError);

      const tools = 'file://tools.js:getTools';
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(/Failed to load tools/);
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(/Unexpected token/);
    });

    it('should handle Python syntax errors gracefully', async () => {
      // Mock runPython to simulate a Python syntax error
      const { runPython } = await import('../../src/python/pythonUtils');
      vi.mocked(runPython).mockRejectedValue(
        new Error('SyntaxError: invalid syntax (tools.py, line 2)'),
      );

      const tools = 'file://tools.py:get_tools';
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(/Failed to load tools/);
      await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(/SyntaxError/);
    });
  });
});

describe('util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readOutput', () => {
    it('reads JSON output', async () => {
      const outputPath = 'output.json';
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      const output = await readOutput(outputPath);
      expect(output).toEqual({});
    });

    it('fails for csv output', async () => {
      await expect(readOutput('output.csv')).rejects.toThrow(
        'Unsupported output file format: csv currently only supports json',
      );
    });

    it('fails for yaml output', async () => {
      await expect(readOutput('output.yaml')).rejects.toThrow(
        'Unsupported output file format: yaml currently only supports json',
      );

      await expect(readOutput('output.yml')).rejects.toThrow(
        'Unsupported output file format: yml currently only supports json',
      );
    });

    it('fails for xml output', async () => {
      await expect(readOutput('output.xml')).rejects.toThrow(
        'Unsupported output file format: xml currently only supports json',
      );
    });
  });

  it('readFilters', async () => {
    const mockFilter = vi.fn();
    const mockedImportModule = vi.mocked(importModule);

    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
    mockedImportModule.mockResolvedValueOnce(mockFilter);

    const filters = await readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
  });

  describe('parsePathOrGlob', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should parse a simple file path with extension', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.txt'),
      });
    });

    it('should parse a file path with function name', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file.py:myFunction')).toEqual({
        extension: '.py',
        functionName: 'myFunction',
        isPathPattern: false,
        filePath: path.join('/base', 'file.py'),
      });
    });

    it('should parse a Go file path with function name', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should parse a directory path', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      expect(parsePathOrGlob('/base', 'dir')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', 'dir'),
      });
    });

    it('should handle non-existent file path gracefully when PROMPTFOO_STRICT_FILES is false', async () => {
      vi.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('File does not exist');
      });
      expect(parsePathOrGlob('/base', 'nonexistent.js')).toEqual({
        extension: '.js',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'nonexistent.js'),
      });
    });

    it('should throw an error for non-existent file path when PROMPTFOO_STRICT_FILES is true', async () => {
      process.env.PROMPTFOO_STRICT_FILES = 'true';
      vi.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('File does not exist');
      });
      expect(() => parsePathOrGlob('/base', 'nonexistent.js')).toThrow('File does not exist');
      delete process.env.PROMPTFOO_STRICT_FILES;
    });

    it('should properly test file existence when function name in the path', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      parsePathOrGlob('/base', 'script.py:myFunction');
      expect(fs.statSync).toHaveBeenCalledWith(path.join('/base', 'script.py'));
    });

    it('should return empty extension for files without extension', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file')).toEqual({
        extension: '',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file'),
      });
    });

    it('should handle relative paths', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('./base', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('./base', 'file.txt'),
      });
    });

    it('should handle paths with environment variables', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      process.env.FILE_PATH = 'file.txt';
      expect(parsePathOrGlob('/base', process.env.FILE_PATH)).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.txt'),
      });
      delete process.env.FILE_PATH;
    });

    it('should handle glob patterns in file path', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', '*.js')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', '*.js'),
      });
    });

    it('should handle complex file paths', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'dir/subdir/file.py:func')).toEqual({
        extension: '.py',
        functionName: 'func',
        isPathPattern: false,
        filePath: path.join('/base', 'dir/subdir/file.py'),
      });
    });

    it('should handle non-standard file extensions', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file.customext')).toEqual({
        extension: '.customext',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.customext'),
      });
    });

    it('should handle deeply nested file paths', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g/file.py:func')).toEqual({
        extension: '.py',
        functionName: 'func',
        isPathPattern: false,
        filePath: path.join('/base', 'a/b/c/d/e/f/g/file.py'),
      });
    });

    it('should handle complex directory paths', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', 'a/b/c/d/e/f/g'),
      });
    });

    it('should join basePath and safeFilename correctly', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      const basePath = 'base';
      const relativePath = 'relative/path/to/file.txt';
      expect(parsePathOrGlob(basePath, relativePath)).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: expect.stringMatching(/base[\\\/]relative[\\\/]path[\\\/]to[\\\/]file.txt/),
      });
    });

    it('should handle empty basePath', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: 'file.txt',
      });
    });

    it('should handle file:// prefix', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('', 'file://file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: 'file.txt',
      });
    });

    it('should handle file://./... with absolute base path', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/absolute/base', 'file://./prompts/file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: expect.stringMatching(/^[/\\]absolute[/\\]base[/\\]prompts[/\\]file\.txt$/),
      });
    });

    it('should handle file://./... with relative base path', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('relative/base', 'file://file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: expect.stringMatching(/^relative[/\\]base[/\\]file\.txt$/),
      });
    });

    it('should handle file:// prefix with Go function', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file://script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should handle file:// prefix with absolute path and Go function', async () => {
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file:///absolute/path/script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: expect.stringMatching(/^[/\\]absolute[/\\]path[/\\]script\.go$/),
      });
    });
  });

  describe('Grader', () => {
    it('should have an id and callApi attributes', async () => {
      const Grader = new TestGrader();
      expect(Grader.id()).toBe('TestGradingProvider');
      await expect(Grader.callApi()).resolves.toEqual({
        output: JSON.stringify({
          pass: true,
          reason: 'Test grading output',
        }),
        tokenUsage: {
          completion: 5,
          prompt: 5,
          total: 10,
        },
      });
    });
  });
});
