import * as fs from 'fs';
import path from 'path';

import { globSync, hasMagic } from 'glob';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  getResolvedRelativePath,
  maybeLoadConfigFromExternalFile,
  maybeLoadFromExternalFile,
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  parsePathOrGlob,
  readFilters,
  readOutput,
} from '../../src/util/file';
import {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isVideoFile,
} from '../../src/util/fileExtensions';

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
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

vi.mock('glob', () => ({
  globSync: vi.fn(),
  hasMagic: vi.fn((path: string) => {
    return /[*?[\]{}]/.test(path) && !path.includes('\\');
  }),
}));

vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
}));

// Import after mocking
import { importModule } from '../../src/esm';

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

describe('file utilities', () => {
  describe('isJavascriptFile', () => {
    it('identifies JavaScript and TypeScript files', () => {
      expect(isJavascriptFile('test.js')).toBe(true);
      expect(isJavascriptFile('test.cjs')).toBe(true);
      expect(isJavascriptFile('test.mjs')).toBe(true);
      expect(isJavascriptFile('test.ts')).toBe(true);
      expect(isJavascriptFile('test.cts')).toBe(true);
      expect(isJavascriptFile('test.mts')).toBe(true);
      expect(isJavascriptFile('test.txt')).toBe(false);
      expect(isJavascriptFile('test.py')).toBe(false);
    });
  });

  describe('isImageFile', () => {
    it('identifies image files correctly', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.jpeg')).toBe(true);
      expect(isImageFile('icon.png')).toBe(true);
      expect(isImageFile('anim.gif')).toBe(true);
      expect(isImageFile('image.bmp')).toBe(true);
      expect(isImageFile('photo.webp')).toBe(true);
      expect(isImageFile('icon.svg')).toBe(true);
      expect(isImageFile('doc.pdf')).toBe(false);
      expect(isImageFile('noextension')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('identifies video files correctly', () => {
      expect(isVideoFile('video.mp4')).toBe(true);
      expect(isVideoFile('clip.webm')).toBe(true);
      expect(isVideoFile('video.ogg')).toBe(true);
      expect(isVideoFile('movie.mov')).toBe(true);
      expect(isVideoFile('video.avi')).toBe(true);
      expect(isVideoFile('clip.wmv')).toBe(true);
      expect(isVideoFile('movie.mkv')).toBe(true);
      expect(isVideoFile('video.m4v')).toBe(true);
      expect(isVideoFile('doc.pdf')).toBe(false);
      expect(isVideoFile('noextension')).toBe(false);
    });
  });

  describe('isAudioFile', () => {
    it('identifies audio files correctly', () => {
      expect(isAudioFile('sound.wav')).toBe(true);
      expect(isAudioFile('music.mp3')).toBe(true);
      expect(isAudioFile('audio.ogg')).toBe(true);
      expect(isAudioFile('sound.aac')).toBe(true);
      expect(isAudioFile('music.m4a')).toBe(true);
      expect(isAudioFile('audio.flac')).toBe(true);
      expect(isAudioFile('sound.wma')).toBe(true);
      expect(isAudioFile('music.aiff')).toBe(true);
      expect(isAudioFile('voice.opus')).toBe(true);
      expect(isAudioFile('doc.pdf')).toBe(false);
      expect(isAudioFile('noextension')).toBe(false);
    });
  });

  describe('maybeLoadFromExternalFile', () => {
    const mockFileContent = 'test content';
    const originalBasePath = cliState.basePath;

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      vi.mocked(hasMagic).mockImplementation((pattern: string | string[]) => {
        const p = Array.isArray(pattern) ? pattern.join('') : pattern;
        return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
      });
      cliState.basePath = '/mock/base/path';
    });

    afterEach(() => {
      cliState.basePath = originalBasePath;
    });

    it('should return non-string inputs as-is', () => {
      expect(maybeLoadFromExternalFile({ foo: 'bar' })).toEqual({ foo: 'bar' });
      expect(maybeLoadFromExternalFile(null)).toBeNull();
      expect(maybeLoadFromExternalFile(undefined)).toBeUndefined();
    });

    it('should return strings that do not start with file:// as-is', () => {
      expect(maybeLoadFromExternalFile('just a string')).toBe('just a string');
      expect(maybeLoadFromExternalFile('/path/to/file')).toBe('/path/to/file');
    });

    it('should load JSON files', () => {
      const mockData = { key: 'value' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

      const result = maybeLoadFromExternalFile('file://test.json');
      expect(result).toEqual(mockData);
    });

    it('should load YAML files', () => {
      const mockData = { key: 'value' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockData));

      const result = maybeLoadFromExternalFile('file://test.yaml');
      expect(result).toEqual(mockData);
    });

    it('should load CSV files', () => {
      const csvContent = 'name,age\nJohn,30\nJane,25';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

      const result = maybeLoadFromExternalFile('file://test.csv');
      expect(result).toEqual([
        { name: 'John', age: '30' },
        { name: 'Jane', age: '25' },
      ]);
    });

    it('should handle glob patterns for YAML files', () => {
      const mockFiles = ['/mock/base/path/scenario1.yaml', '/mock/base/path/scenario2.yaml'];
      const mockData1 = { test: 'scenario1' };
      const mockData2 = { test: 'scenario2' };

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(yaml.dump(mockData1))
        .mockReturnValueOnce(yaml.dump(mockData2));

      const result = maybeLoadFromExternalFile('file://scenarios/*.yaml');
      expect(result).toEqual([mockData1, mockData2]);
      expect(globSync).toHaveBeenCalledWith(path.resolve('/mock/base/path', 'scenarios/*.yaml'), {
        windowsPathsNoEscape: true,
      });
    });

    it('should handle glob patterns for JSON files', () => {
      const mockFiles = ['/mock/base/path/data1.json', '/mock/base/path/data2.json'];
      const mockData1 = { id: 1 };
      const mockData2 = { id: 2 };

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockData1))
        .mockReturnValueOnce(JSON.stringify(mockData2));

      const result = maybeLoadFromExternalFile('file://data*.json');
      expect(result).toEqual([mockData1, mockData2]);
    });

    it('should handle glob patterns with arrays in files', () => {
      const mockFiles = ['/mock/base/path/tests1.yaml', '/mock/base/path/tests2.yaml'];
      const mockData1 = [{ test: 'a' }, { test: 'b' }];
      const mockData2 = [{ test: 'c' }, { test: 'd' }];

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(yaml.dump(mockData1))
        .mockReturnValueOnce(yaml.dump(mockData2));

      const result = maybeLoadFromExternalFile('file://tests*.yaml');
      expect(result).toEqual([{ test: 'a' }, { test: 'b' }, { test: 'c' }, { test: 'd' }]);
    });

    it('should handle single-column CSV files consistently with glob patterns', () => {
      const mockFiles = ['/mock/base/path/data1.csv', '/mock/base/path/data2.csv'];
      const csvContent1 = 'name\nAlice\nBob';
      const csvContent2 = 'name\nCharlie\nDavid';

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(csvContent1).mockReturnValueOnce(csvContent2);

      const result = maybeLoadFromExternalFile('file://data*.csv');
      // Should return array of values, not objects
      expect(result).toEqual(['Alice', 'Bob', 'Charlie', 'David']);
    });

    it('should handle multi-column CSV files with glob patterns', () => {
      const mockFiles = ['/mock/base/path/users.csv'];
      const csvContent = 'name,age\nAlice,30\nBob,25';

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

      const result = maybeLoadFromExternalFile('file://users*.csv');
      // Should return array of objects for multi-column CSV
      expect(result).toEqual([
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ]);
    });

    it('should handle empty YAML files in glob patterns', () => {
      const mockFiles = ['/mock/base/path/empty.yaml', '/mock/base/path/data.yaml'];
      const mockData = { test: 'data' };

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('') // Empty file
        .mockReturnValueOnce(yaml.dump(mockData));

      const result = maybeLoadFromExternalFile('file://**.yaml');
      // Should skip empty file and only include valid data
      expect(result).toEqual([mockData]);
    });

    it('should throw error when glob pattern matches no files', () => {
      vi.mocked(globSync).mockReturnValue([]);

      expect(() => maybeLoadFromExternalFile('file://nonexistent/*.yaml')).toThrow(
        `No files found matching pattern: ${path.resolve('/mock/base/path', 'nonexistent/*.yaml')}`,
      );
    });

    it('should throw error when file does not exist', () => {
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw enoentError;
      });

      expect(() => maybeLoadFromExternalFile('file://nonexistent.yaml')).toThrow(
        `File does not exist: ${path.resolve('/mock/base/path', 'nonexistent.yaml')}`,
      );
    });

    it('should handle arrays of file paths', () => {
      const mockData1 = { key: 'value1' };
      const mockData2 = { key: 'value2' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockData1))
        .mockReturnValueOnce(JSON.stringify(mockData2));

      const result = maybeLoadFromExternalFile(['file://test1.json', 'file://test2.json']);
      expect(result).toEqual([mockData1, mockData2]);
    });

    it('should use basePath when resolving file paths', () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle relative paths correctly', () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle a path with environment variables in Nunjucks template', () => {
      process.env.TEST_ROOT_PATH = '/root/dir';
      const input = 'file://{{ env.TEST_ROOT_PATH }}/test.txt';

      const expectedPath = path.resolve(`${process.env.TEST_ROOT_PATH}/test.txt`);
      maybeLoadFromExternalFile(input);

      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      delete process.env.TEST_ROOT_PATH;
    });

    it('should ignore basePath when file path is absolute', () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file:///absolute/path/test.txt');

      const expectedPath = path.resolve('/absolute/path/test.txt');
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle list of paths', () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      const input = ['file://test1.txt', 'file://test2.txt', 'file://test3.txt'];

      // Mock readFileSync to return consistent data
      const mockFileData = 'test content';
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileData);

      maybeLoadFromExternalFile(input);

      expect(fs.readFileSync).toHaveBeenCalledTimes(3);
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test1.txt'), 'utf8');
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test2.txt'), 'utf8');
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test3.txt'), 'utf8');

      cliState.basePath = undefined;
    });

    it('should recursively load file references in objects', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": 1}').mockReturnValueOnce('bar');

      const config = {
        data: 'file://data.json',
        nested: {
          text: 'file://note.txt',
        },
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: { foo: 1 }, nested: { text: 'bar' } });
    });

    it('should handle arrays and nested structures', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content');

      const config = {
        items: ['file://test.txt', 'normal string'],
        nullValue: null,
        emptyArray: [],
        nested: {
          deep: {
            value: 'file://test.txt',
          },
        },
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        items: ['test content', 'normal string'],
        nullValue: null,
        emptyArray: [],
        nested: {
          deep: {
            value: 'test content',
          },
        },
      });
    });

    it('should handle primitive values safely', () => {
      expect(maybeLoadConfigFromExternalFile('normal string')).toBe('normal string');
      expect(maybeLoadConfigFromExternalFile(42)).toBe(42);
      expect(maybeLoadConfigFromExternalFile(true)).toBe(true);
      expect(maybeLoadConfigFromExternalFile(null)).toBeNull();
      expect(maybeLoadConfigFromExternalFile(undefined)).toBeUndefined();
    });

    it('should handle deeply nested objects with multiple file references', () => {
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('{"nested": {"value": 123}}')
        .mockReturnValueOnce('["item1", "item2"]')
        .mockReturnValueOnce('deeply nested content');

      const config = {
        level1: {
          level2: {
            level3: {
              data: 'file://deep.json',
              items: 'file://items.json',
              level4: {
                content: 'file://content.txt',
                static: 'unchanged',
              },
            },
          },
        },
        topLevel: 'unchanged',
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(fs.readFileSync).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              data: { nested: { value: 123 } },
              items: ['item1', 'item2'],
              level4: {
                content: 'deeply nested content',
                static: 'unchanged',
              },
            },
          },
        },
        topLevel: 'unchanged',
      });
    });

    it('should handle arrays with mixed content types including file references', () => {
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('{"config": "loaded"}')
        .mockReturnValueOnce('text content')
        .mockReturnValueOnce('{"config": "loaded"}');

      const config = {
        mixedArray: [
          'string value',
          42,
          true,
          { normal: 'object' },
          'file://config.json',
          ['nested', 'array', 'file://text.txt'],
          null,
          { nested: { file: 'file://config.json' } },
        ],
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual({
        mixedArray: [
          'string value',
          42,
          true,
          { normal: 'object' },
          { config: 'loaded' },
          ['nested', 'array', 'text content'],
          null,
          { nested: { file: { config: 'loaded' } } },
        ],
      });
    });

    it('should handle edge cases with empty objects and arrays', () => {
      const config = {
        emptyObject: {},
        emptyArray: [],
        arrayWithEmpties: [{}, [], null, undefined, ''],
        nested: {
          empty: {},
          moreNested: {
            stillEmpty: {},
            emptyArray: [],
          },
        },
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual(config);
    });

    it('should preserve object keys that contain special characters', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('special content');

      const config = {
        'key-with-dashes': 'file://special.txt',
        'key.with.dots': 'normal value',
        'key with spaces': { nested: 'value' },
        'key@with#symbols': ['array', 'value'],
        123: 'numeric key',
        '': 'empty key',
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual({
        'key-with-dashes': 'special content',
        'key.with.dots': 'normal value',
        'key with spaces': { nested: 'value' },
        'key@with#symbols': ['array', 'value'],
        123: 'numeric key',
        '': 'empty key',
      });
    });

    it('should handle objects with prototype pollution attempts safely', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('malicious content');

      const config = {
        __proto__: 'file://malicious.txt',
        constructor: { normal: 'value' },
        prototype: ['safe', 'array'],
        normal: 'safe value',
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual({
        __proto__: 'malicious content',
        constructor: { normal: 'value' },
        prototype: ['safe', 'array'],
        normal: 'safe value',
      });
    });

    it('should handle very large nested structures efficiently', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('file content');

      // Create a large nested structure
      const createNestedConfig = (depth: number): any => {
        if (depth === 0) {
          return 'file://test.txt';
        }
        return {
          [`level${depth}`]: createNestedConfig(depth - 1),
          [`static${depth}`]: `value at depth ${depth}`,
        };
      };

      const config = createNestedConfig(10);
      const result = maybeLoadConfigFromExternalFile(config);

      // Should have loaded the file reference at the deepest level
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);

      // Verify the structure is preserved
      let current = result;
      for (let i = 10; i > 0; i--) {
        expect(current).toHaveProperty(`level${i}`);
        expect(current).toHaveProperty(`static${i}`, `value at depth ${i}`);
        current = current[`level${i}`];
      }
      expect(current).toBe('file content');
    });

    it('should handle functions and undefined values in objects gracefully', () => {
      const testFunction = () => 'test';

      const config = {
        func: testFunction,
        undef: undefined,
        normal: 'value',
        nested: {
          func2: testFunction,
          undef2: undefined,
        },
      };

      const result = maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual(config);
      expect(result.func).toBe(testFunction);
      expect(result.nested.func2).toBe(testFunction);
    });

    it('should return original string for Python files with function names', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = maybeLoadFromExternalFile('file://assert.py:my_function');

      // Should return the original string, not attempt to load file
      expect(result).toBe('file://assert.py:my_function');
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return original string for JavaScript files with function names', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const jsFiles = ['file://test.js:myFunc', 'file://test.ts:myFunc', 'file://test.mjs:myFunc'];

      for (const fileRef of jsFiles) {
        const result = maybeLoadFromExternalFile(fileRef);
        expect(result).toBe(fileRef);
      }

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should load Python/JS files normally when no function name specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('file contents');

      const result = maybeLoadFromExternalFile('file://test.py');

      expect(result).toBe('file contents');
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should handle Windows drive letters correctly', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Drive letter colon should not be treated as function separator
      const result = maybeLoadFromExternalFile('file://C:/path/test.py:myFunc');

      expect(result).toBe('file://C:/path/test.py:myFunc');
    });

    it('should handle non-Python/JS files with colons normally', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{"data": "test"}');

      // JSON file with colon should still load normally (not treated as function)
      const result = maybeLoadFromExternalFile('file://data:test.json');

      expect(result).toEqual({ data: 'test' });
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should preserve function references in config objects (integration test)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock config object similar to what would be loaded from YAML tests
      const config = {
        assert: [
          {
            type: 'python',
            value: 'file://assert.py:my_function',
          },
          {
            type: 'javascript',
            value: 'file://assert.js:my_function',
          },
        ],
      };

      const result = maybeLoadConfigFromExternalFile(config);

      // Function references should be preserved unchanged
      expect(result.assert[0].value).toBe('file://assert.py:my_function');
      expect(result.assert[1].value).toBe('file://assert.js:my_function');

      // No file system calls should have been made for function references
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should still support glob patterns after refactor (regression test)', () => {
      const mockFiles = ['/mock/base/path/test1.yaml', '/mock/base/path/test2.yaml'];
      const mockData1 = { test: 'data1' };
      const mockData2 = { test: 'data2' };

      vi.mocked(globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(yaml.dump(mockData1))
        .mockReturnValueOnce(yaml.dump(mockData2));

      const result = maybeLoadFromExternalFile('file://test*.yaml');

      // Glob expansion should still work correctly
      expect(result).toEqual([mockData1, mockData2]);
      expect(globSync).toHaveBeenCalledWith(path.resolve('/mock/base/path', 'test*.yaml'), {
        windowsPathsNoEscape: true,
      });
    });
  });

  describe('getResolvedRelativePath', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
      vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    });

    afterEach(() => {
      vi.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    });

    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(getResolvedRelativePath(absolutePath, false)).toBe(absolutePath);
    });

    it('uses process.cwd() when isCloudConfig is true', () => {
      expect(getResolvedRelativePath('relative/file.txt', true)).toBe(
        path.join('/mock/cwd', 'relative/file.txt'),
      );
    });
  });

  describe('context-aware file loading', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('file content');
      vi.mocked(hasMagic).mockImplementation((pattern: string | string[]) => {
        const p = Array.isArray(pattern) ? pattern.join('') : pattern;
        return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
      });
      cliState.basePath = '/test';
    });

    describe('maybeLoadFromExternalFile with context', () => {
      it('should preserve Python files in assertion context', () => {
        const result = maybeLoadFromExternalFile('file://assert.py', 'assertion');
        expect(result).toBe('file://assert.py');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve Python files with function names in assertion context', () => {
        const result = maybeLoadFromExternalFile('file://assert.py:get_assert', 'assertion');
        expect(result).toBe('file://assert.py:get_assert');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve JavaScript files in assertion context', () => {
        const result = maybeLoadFromExternalFile('file://assert.js', 'assertion');
        expect(result).toBe('file://assert.js');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve TypeScript files in assertion context', () => {
        const result = maybeLoadFromExternalFile('file://assert.ts', 'assertion');
        expect(result).toBe('file://assert.ts');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should load Python files normally in general context', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('def test(): pass');
        const result = maybeLoadFromExternalFile('file://script.py', 'general');
        expect(result).toBe('def test(): pass');
        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should load JavaScript files normally in general context', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('module.exports = {};');
        const result = maybeLoadFromExternalFile('file://script.js', 'general');
        expect(result).toBe('module.exports = {};');
        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should load Python files normally when no context provided', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('def test(): pass');
        const result = maybeLoadFromExternalFile('file://script.py');
        expect(result).toBe('def test(): pass');
        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should load non-code files normally in assertion context', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('test data');
        const result = maybeLoadFromExternalFile('file://data.txt', 'assertion');
        expect(result).toBe('test data');
        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should handle Windows paths correctly in assertion context', () => {
        const result = maybeLoadFromExternalFile('file://C:/test/assert.py', 'assertion');
        expect(result).toBe('file://C:/test/assert.py');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should handle arrays in assertion context', () => {
        const files = ['file://assert1.py', 'file://assert2.js', 'file://data.txt'];
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('file content');
        const result = maybeLoadFromExternalFile(files, 'assertion');

        expect(result).toEqual(['file://assert1.py', 'file://assert2.js', 'file content']);
        expect(fs.readFileSync).toHaveBeenCalledTimes(1); // Only data.txt should be loaded
      });
    });

    describe('maybeLoadConfigFromExternalFile with assertion detection', () => {
      it('should preserve Python assertion file references', () => {
        const config = {
          assert: [
            {
              type: 'python',
              value: 'file://good_assertion.py',
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.assert[0].value).toBe('file://good_assertion.py');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve JavaScript assertion file references', () => {
        const config = {
          assert: [
            {
              type: 'javascript',
              value: 'file://assertion.js:checkResult',
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.assert[0].value).toBe('file://assertion.js:checkResult');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should load non-assertion Python files normally', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('def utility(): pass');
        const config = {
          util: 'file://helper.py',
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.util).toBe('def utility(): pass');
        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should handle nested assertion objects', () => {
        const config = {
          tests: [
            {
              assert: [
                {
                  type: 'python',
                  value: 'file://nested_assertion.py',
                },
              ],
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.tests[0].assert[0].value).toBe('file://nested_assertion.py');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should handle mixed assertion types', () => {
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('some data');
        const config = {
          assert: [
            {
              type: 'python',
              value: 'file://python_assert.py',
            },
            {
              type: 'contains',
              value: 'file://expected.txt',
            },
            {
              type: 'javascript',
              value: 'file://js_assert.js',
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.assert[0].value).toBe('file://python_assert.py');
        expect(result.assert[1].value).toBe('some data'); // contains assertion loads file
        expect(result.assert[2].value).toBe('file://js_assert.js');
        expect(fs.readFileSync).toHaveBeenCalledTimes(1); // Only expected.txt
      });
    });

    describe('maybeLoadConfigFromExternalFile with vars context', () => {
      it('should preserve glob patterns in vars field for test case expansion', () => {
        const config = {
          vars: {
            text: 'file://./resources/tests/*.json',
          },
          assert: [
            {
              type: 'contains',
              value: 'hello',
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.vars.text).toBe('file://./resources/tests/*.json');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve glob patterns in nested vars objects', () => {
        const config = {
          tests: [
            {
              vars: {
                input: 'file://inputs/*.txt',
                data: 'file://data/test-*.json',
                patterns: 'file://data/test-{a,b}.yaml',
                optional: 'file://data/file?.json',
              },
            },
          ],
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.tests[0].vars.input).toBe('file://inputs/*.txt');
        expect(result.tests[0].vars.data).toBe('file://data/test-*.json');
        expect(result.tests[0].vars.patterns).toBe('file://data/test-{a,b}.yaml');
        expect(result.tests[0].vars.optional).toBe('file://data/file?.json');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve non-glob file references in vars for runtime loading by renderPrompt', () => {
        const config = {
          vars: {
            content: 'file://content.txt', // No glob pattern - still preserved
          },
        };
        const result = maybeLoadConfigFromExternalFile(config);
        // File references in vars should be preserved for runtime loading
        // JS/Python files will be executed by renderPrompt in evaluatorHelpers.ts
        expect(result.vars.content).toBe('file://content.txt');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve JS file references in vars for runtime execution', () => {
        const config = {
          vars: {
            dynamicContent: 'file://generateContent.js',
          },
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.vars.dynamicContent).toBe('file://generateContent.js');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve Python file references in vars for runtime execution', () => {
        const config = {
          vars: {
            dynamicContent: 'file://generateContent.py',
          },
        };
        const result = maybeLoadConfigFromExternalFile(config);
        expect(result.vars.dynamicContent).toBe('file://generateContent.py');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve all file references in nested test cases loaded from external files', () => {
        // This tests the scenario from PR #6393 where test cases are loaded
        // from an external YAML file and contain JS/Python file references in vars
        const testCasesFromExternalFile = [
          {
            vars: {
              question: 'What is the policy?',
              context: 'file://load_context.py',
            },
          },
          {
            vars: {
              question: 'How does this work?',
              context: 'file://load_context.js',
            },
          },
        ];

        const result = maybeLoadConfigFromExternalFile(testCasesFromExternalFile);

        // Both Python and JS file references should be preserved for runtime execution
        expect(result[0].vars.context).toBe('file://load_context.py');
        expect(result[1].vars.context).toBe('file://load_context.js');
        // Static values should remain unchanged
        expect(result[0].vars.question).toBe('What is the policy?');
        expect(result[1].vars.question).toBe('How does this work?');
        // No files should have been read
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });

      it('should preserve plain text file references in vars for consistent runtime loading', () => {
        // Plain text files are also preserved for runtime loading by renderPrompt
        // This ensures consistent behavior across all file types
        const config = {
          tests: [
            {
              vars: {
                content: 'file://content.txt',
                data: 'file://data.json',
              },
            },
          ],
        };

        const result = maybeLoadConfigFromExternalFile(config);

        expect(result.tests[0].vars.content).toBe('file://content.txt');
        expect(result.tests[0].vars.data).toBe('file://data.json');
        expect(fs.readFileSync).not.toHaveBeenCalled();
      });
    });
  });

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

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
    });

    it('should handle array of file paths', async () => {
      const tools = ['file://tools1.json', 'file://tools2.json'];

      await maybeLoadToolsFromExternalFile(tools);

      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    describe('validation', () => {
      it('should throw error for Python/JS/TS file with function name when file not found', async () => {
        const pythonTools = 'file://nonexistent.py:get_tools';
        await expect(maybeLoadToolsFromExternalFile(pythonTools)).rejects.toThrow(
          /Failed to load tools/,
        );

        const jsTools = 'file://nonexistent.js:getTools';
        await expect(maybeLoadToolsFromExternalFile(jsTools)).rejects.toThrow(
          /Failed to load tools/,
        );

        const tsTools = 'file://nonexistent.ts:getTools';
        await expect(maybeLoadToolsFromExternalFile(tsTools)).rejects.toThrow(
          /Failed to load tools/,
        );
      });

      it('should throw error for Python file without function name', async () => {
        const tools = 'file://tools.py';

        await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
          /Python files require a function name/,
        );
        await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
          /file:\/\/tools\.py:get_tools/,
        );
      });

      it('should throw error for JavaScript file without function name', async () => {
        const tools = 'file://tools.js';

        await expect(maybeLoadToolsFromExternalFile(tools)).rejects.toThrow(
          /JavaScript files require a function name/,
        );
      });

      it('should throw error for invalid string content', async () => {
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

  describe('maybeLoadFromExternalFileWithVars', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should render variables and load from file', () => {
      const mockContent = JSON.stringify({ name: 'test', value: 123 });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = maybeLoadFromExternalFileWithVars('file://{{ filename }}.json', {
        filename: 'config',
      });

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('config.json'), 'utf8');
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should render variables in object', () => {
      const config = {
        name: '{{ name }}',
        apiKey: '{{ api_key }}',
      };
      const vars = { name: 'test-function', api_key: 'sk-123' };

      const result = maybeLoadFromExternalFileWithVars(config, vars);

      expect(result).toEqual({
        name: 'test-function',
        apiKey: 'sk-123',
      });
    });

    it('should pass through non-file values unchanged', () => {
      const config = { type: 'function', name: 'calculator' };
      const result = maybeLoadFromExternalFileWithVars(config, {});

      expect(result).toEqual(config);
    });

    it('should handle undefined and null', () => {
      expect(maybeLoadFromExternalFileWithVars(undefined, {})).toBeUndefined();
      expect(maybeLoadFromExternalFileWithVars(null, {})).toBeNull();
    });
  });

  describe('maybeLoadResponseFormatFromExternalFile', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should return undefined for undefined input', () => {
      expect(maybeLoadResponseFormatFromExternalFile(undefined, {})).toBeUndefined();
    });

    it('should return null for null input', () => {
      expect(maybeLoadResponseFormatFromExternalFile(null, {})).toBeNull();
    });

    it('should load response_format from file', () => {
      const mockFormat = JSON.stringify({
        type: 'json_schema',
        json_schema: { name: 'my_schema', schema: { type: 'object' } },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockFormat);

      const result = maybeLoadResponseFormatFromExternalFile('file://format.json', {});

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('format.json'), 'utf8');
      expect(result).toEqual({
        type: 'json_schema',
        json_schema: { name: 'my_schema', schema: { type: 'object' } },
      });
    });

    it('should render variables in response_format', () => {
      const format = {
        type: 'json_schema',
        name: '{{ schema_name }}',
        schema: { type: 'object' },
      };
      const vars = { schema_name: 'my_custom_schema' };

      const result = maybeLoadResponseFormatFromExternalFile(format, vars);

      expect(result).toEqual({
        type: 'json_schema',
        name: 'my_custom_schema',
        schema: { type: 'object' },
      });
    });

    it('should load nested schema from file when schema is a file reference', () => {
      const nestedSchema = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(nestedSchema);

      const format = {
        type: 'json_schema',
        name: 'test_schema',
        schema: 'file://schema.json',
      };

      const result = maybeLoadResponseFormatFromExternalFile(format, {});

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('schema.json'), 'utf8');
      expect(result).toEqual({
        type: 'json_schema',
        name: 'test_schema',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      });
    });

    it('should load nested json_schema.schema from file', () => {
      const nestedSchema = JSON.stringify({
        type: 'object',
        required: ['id'],
      });
      vi.mocked(fs.readFileSync).mockReturnValue(nestedSchema);

      const format = {
        type: 'json_schema',
        json_schema: {
          name: 'nested_schema',
          schema: 'file://nested.json',
        },
      };

      const result = maybeLoadResponseFormatFromExternalFile(format, {});

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('nested.json'), 'utf8');
      expect(result).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'nested_schema',
          schema: {
            type: 'object',
            required: ['id'],
          },
        },
      });
    });

    it('should render variables in nested schema file path', () => {
      const nestedSchema = JSON.stringify({ type: 'object' });
      vi.mocked(fs.readFileSync).mockReturnValue(nestedSchema);

      const format = {
        type: 'json_schema',
        name: 'dynamic_schema',
        schema: 'file://{{ schema_file }}.json',
      };
      const vars = { schema_file: 'my-schema' };

      maybeLoadResponseFormatFromExternalFile(format, vars);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('my-schema.json'),
        'utf8',
      );
    });

    it('should pass through json_object type without modification', () => {
      const format = { type: 'json_object' };
      const result = maybeLoadResponseFormatFromExternalFile(format, {});

      expect(result).toEqual({ type: 'json_object' });
    });

    it('should pass through non-json_schema types without nested loading', () => {
      const format = { type: 'text' };
      const result = maybeLoadResponseFormatFromExternalFile(format, {});

      expect(result).toEqual({ type: 'text' });
    });

    it('should handle inline schema without file loading', () => {
      const format = {
        type: 'json_schema',
        name: 'inline_schema',
        schema: {
          type: 'object',
          properties: { count: { type: 'number' } },
        },
      };

      const result = maybeLoadResponseFormatFromExternalFile(format, {});

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result).toEqual(format);
    });

    it('should handle chained file references (outer file contains nested file reference)', () => {
      // This tests the critical case where:
      // 1. response_format: file://format.json
      // 2. format.json contains { type: 'json_schema', schema: 'file://schema.json' }
      // Both files should be loaded correctly
      const outerFormat = JSON.stringify({
        type: 'json_schema',
        name: 'chained_schema',
        schema: 'file://nested-schema.json',
      });
      const nestedSchema = JSON.stringify({
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      });

      // Mock fs.readFileSync to return different content based on the file path
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('format.json')) {
          return outerFormat;
        }
        if (filePath.includes('nested-schema.json')) {
          return nestedSchema;
        }
        throw new Error(`Unexpected file: ${filePath}`);
      });

      const result = maybeLoadResponseFormatFromExternalFile('file://format.json', {});

      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('format.json'), 'utf8');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('nested-schema.json'),
        'utf8',
      );
      expect(result).toEqual({
        type: 'json_schema',
        name: 'chained_schema',
        schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      });
    });

    it('should propagate errors when nested schema file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const format = {
        type: 'json_schema',
        name: 'test_schema',
        schema: 'file://nonexistent.json',
      };

      expect(() => maybeLoadResponseFormatFromExternalFile(format, {})).toThrow();
    });
  });

  describe('readOutput', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset fs.readFileSync mock to clear any mockReturnValue from other tests
      vi.mocked(fs.readFileSync).mockReset();
    });

    it('reads JSON output', () => {
      const outputPath = 'output.json';
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      const output = readOutput(outputPath);
      expect(output).toEqual({});
    });

    it('fails for csv output', () => {
      expect(() => readOutput('output.csv')).toThrow(
        'Unsupported output file format: csv currently only supports json',
      );
    });

    it('fails for yaml output', () => {
      expect(() => readOutput('output.yaml')).toThrow(
        'Unsupported output file format: yaml currently only supports json',
      );

      expect(() => readOutput('output.yml')).toThrow(
        'Unsupported output file format: yml currently only supports json',
      );
    });

    it('fails for xml output', () => {
      expect(() => readOutput('output.xml')).toThrow(
        'Unsupported output file format: xml currently only supports json',
      );
    });
  });

  describe('readFilters', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('loads filter from file', async () => {
      const mockFilter = vi.fn();
      const mockedImportModule = vi.mocked(importModule);

      vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
      mockedImportModule.mockResolvedValueOnce(mockFilter);

      const filters = await readFilters({ testFilter: 'filter.js' });

      expect(filters.testFilter).toBe(mockFilter);
    });

    it('returns empty object when no filters provided', async () => {
      const filters = await readFilters({});
      expect(filters).toEqual({});
    });

    it('handles non-existent filter file gracefully', async () => {
      vi.mocked(globSync).mockReturnValue([]);
      const filters = await readFilters({ testFilter: 'nonexistent.js' });
      expect(filters.testFilter).toBeUndefined();
    });

    it('throws when importModule fails', async () => {
      vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
      vi.mocked(importModule).mockRejectedValueOnce(new Error('Module load failed'));

      await expect(readFilters({ testFilter: 'invalid.js' })).rejects.toThrow('Module load failed');
    });
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
});
