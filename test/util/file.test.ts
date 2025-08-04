import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';

import { globSync } from 'glob';
import yaml from 'js-yaml';
import cliState from '../../src/cliState';
import {
  getResolvedRelativePath,
  maybeLoadConfigFromExternalFile,
  maybeLoadFromExternalFile,
} from '../../src/util/file';
import { safeJoin, safeResolve } from '../../src/util/file.node';
import {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isVideoFile,
} from '../../src/util/fileExtensions';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('glob');

describe('file utilities', () => {
  // Helper to create platform-appropriate file URLs
  const getFileUrl = (path: string) => {
    return process.platform === 'win32'
      ? `file:///C:/${path.replace(/\\/g, '/')}`
      : `file:///${path}`;
  };

  describe('isJavascriptFile', () => {
    it('identifies JavaScript and TypeScript files', async () => {
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
    it('identifies image files correctly', async () => {
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
    it('identifies video files correctly', async () => {
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
    it('identifies audio files correctly', async () => {
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
      jest.resetAllMocks();
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fsPromises.readFile).mockResolvedValue(mockFileContent);
      cliState.basePath = '/mock/base/path';
    });

    afterEach(() => {
      cliState.basePath = originalBasePath;
    });

    it('should return non-string inputs as-is', async () => {
      expect(await maybeLoadFromExternalFile({ foo: 'bar' })).toEqual({ foo: 'bar' });
      expect(await maybeLoadFromExternalFile(null)).toBeNull();
      expect(await maybeLoadFromExternalFile(undefined)).toBeUndefined();
    });

    it('should return strings that do not start with file:// as-is', async () => {
      expect(await maybeLoadFromExternalFile('just a string')).toBe('just a string');
      expect(await maybeLoadFromExternalFile('/path/to/file')).toBe('/path/to/file');
    });

    it('should load JSON files', async () => {
      const mockData = { key: 'value' };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockData));

      const result = await maybeLoadFromExternalFile('file://test.json');
      expect(result).toEqual(mockData);
    });

    it('should load YAML files', async () => {
      const mockData = { key: 'value' };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fsPromises.readFile).mockResolvedValue(yaml.dump(mockData));

      const result = await maybeLoadFromExternalFile('file://test.yaml');
      expect(result).toEqual(mockData);
    });

    it('should load CSV files', async () => {
      const csvContent = 'name,age\nJohn,30\nJane,25';
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fsPromises.readFile).mockResolvedValue(csvContent);

      const result = await maybeLoadFromExternalFile('file://test.csv');
      expect(result).toEqual([
        { name: 'John', age: '30' },
        { name: 'Jane', age: '25' },
      ]);
    });

    it('should handle glob patterns for YAML files', async () => {
      const mockFiles = ['/mock/base/path/scenario1.yaml', '/mock/base/path/scenario2.yaml'];
      const mockData1 = { test: 'scenario1' };
      const mockData2 = { test: 'scenario2' };

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce(yaml.dump(mockData1))
        .mockResolvedValueOnce(yaml.dump(mockData2));

      const result = await maybeLoadFromExternalFile('file://scenarios/*.yaml');
      expect(result).toEqual([mockData1, mockData2]);
      expect(globSync).toHaveBeenCalledWith(path.resolve('/mock/base/path', 'scenarios/*.yaml'), {
        windowsPathsNoEscape: true,
      });
    });

    it('should handle glob patterns for JSON files', async () => {
      const mockFiles = ['/mock/base/path/data1.json', '/mock/base/path/data2.json'];
      const mockData1 = { id: 1 };
      const mockData2 = { id: 2 };

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce(JSON.stringify(mockData1))
        .mockResolvedValueOnce(JSON.stringify(mockData2));

      const result = await maybeLoadFromExternalFile('file://data*.json');
      expect(result).toEqual([mockData1, mockData2]);
    });

    it('should handle glob patterns with arrays in files', async () => {
      const mockFiles = ['/mock/base/path/tests1.yaml', '/mock/base/path/tests2.yaml'];
      const mockData1 = [{ test: 'a' }, { test: 'b' }];
      const mockData2 = [{ test: 'c' }, { test: 'd' }];

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce(yaml.dump(mockData1))
        .mockResolvedValueOnce(yaml.dump(mockData2));

      const result = await maybeLoadFromExternalFile('file://tests*.yaml');
      expect(result).toEqual([{ test: 'a' }, { test: 'b' }, { test: 'c' }, { test: 'd' }]);
    });

    it('should handle single-column CSV files consistently with glob patterns', async () => {
      const mockFiles = ['/mock/base/path/data1.csv', '/mock/base/path/data2.csv'];
      const csvContent1 = 'name\nAlice\nBob';
      const csvContent2 = 'name\nCharlie\nDavid';

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce(csvContent1)
        .mockResolvedValueOnce(csvContent2);

      const result = await maybeLoadFromExternalFile('file://data*.csv');
      // Should return array of values, not objects
      expect(result).toEqual(['Alice', 'Bob', 'Charlie', 'David']);
    });

    it('should handle multi-column CSV files with glob patterns', async () => {
      const mockFiles = ['/mock/base/path/users.csv'];
      const csvContent = 'name,age\nAlice,30\nBob,25';

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest.mocked(fsPromises.readFile).mockResolvedValue(csvContent);

      const result = await maybeLoadFromExternalFile('file://users*.csv');
      // Should return array of objects for multi-column CSV
      expect(result).toEqual([
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ]);
    });

    it('should handle empty YAML files in glob patterns', async () => {
      const mockFiles = ['/mock/base/path/empty.yaml', '/mock/base/path/data.yaml'];
      const mockData = { test: 'data' };

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce('') // Empty file
        .mockResolvedValueOnce(yaml.dump(mockData));

      const result = await maybeLoadFromExternalFile('file://**.yaml');
      // Should skip empty file and only include valid data
      expect(result).toEqual([mockData]);
    });

    it('should throw error when glob pattern matches no files', async () => {
      jest.mocked(globSync).mockReturnValue([]);

      await expect(maybeLoadFromExternalFile('file://nonexistent/*.yaml')).rejects.toThrow(
        `No files found matching pattern: ${path.resolve('/mock/base/path', 'nonexistent/*.yaml')}`,
      );
    });

    it('should throw error when file does not exist', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);

      await expect(maybeLoadFromExternalFile('file://nonexistent.yaml')).rejects.toThrow(
        `File does not exist: ${path.resolve('/mock/base/path', 'nonexistent.yaml')}`,
      );
    });

    it('should handle arrays of file paths', async () => {
      const mockData1 = { key: 'value1' };
      const mockData2 = { key: 'value2' };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce(JSON.stringify(mockData1))
        .mockResolvedValueOnce(JSON.stringify(mockData2));

      const result = await maybeLoadFromExternalFile(['file://test1.json', 'file://test2.json']);
      expect(result).toEqual([mockData1, mockData2]);
    });

    it('should use basePath when resolving file paths', async () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      jest.mocked(fsPromises.readFile).mockResolvedValue(mockFileContent);

      await maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle relative paths correctly', async () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      jest.mocked(fsPromises.readFile).mockResolvedValue(mockFileContent);

      await maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle a path with environment variables in Nunjucks template', async () => {
      process.env.TEST_ROOT_PATH = '/root/dir';
      const input = 'file://{{ env.TEST_ROOT_PATH }}/test.txt';

      jest.mocked(fs.existsSync).mockReturnValue(true);

      const expectedPath = path.resolve(`${process.env.TEST_ROOT_PATH}/test.txt`);
      await maybeLoadFromExternalFile(input);

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');

      delete process.env.TEST_ROOT_PATH;
    });

    it('should ignore basePath when file path is absolute', async () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      jest.mocked(fsPromises.readFile).mockResolvedValue(mockFileContent);

      await maybeLoadFromExternalFile('file:///absolute/path/test.txt');

      const expectedPath = path.resolve('/absolute/path/test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle list of paths', async () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      const input = ['file://test1.txt', 'file://test2.txt', 'file://test3.txt'];

      // Mock readFileSync to return consistent data
      const mockFileData = 'test content';
      jest.mocked(fsPromises.readFile).mockResolvedValue(mockFileData);

      await maybeLoadFromExternalFile(input);

      expect(fs.existsSync).toHaveBeenCalledTimes(3);
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test1.txt'));
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test2.txt'));
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test3.txt'));

      expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
      expect(fsPromises.readFile).toHaveBeenCalledWith(path.resolve(basePath, 'test1.txt'), 'utf8');
      expect(fsPromises.readFile).toHaveBeenCalledWith(path.resolve(basePath, 'test2.txt'), 'utf8');
      expect(fsPromises.readFile).toHaveBeenCalledWith(path.resolve(basePath, 'test3.txt'), 'utf8');

      cliState.basePath = undefined;
    });

    it('should recursively load file references in objects', async () => {
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce('{"foo": 1}')
        .mockResolvedValueOnce('bar');

      const config = {
        data: 'file://data.json',
        nested: {
          text: 'file://note.txt',
        },
      };

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(fsPromises.readFile).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: { foo: 1 }, nested: { text: 'bar' } });
    });

    it('should handle arrays and nested structures', async () => {
      jest.mocked(fsPromises.readFile).mockResolvedValueOnce('test content');

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

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(fsPromises.readFile).toHaveBeenCalledTimes(2);
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

    it('should handle primitive values safely', async () => {
      expect(await maybeLoadConfigFromExternalFile('normal string')).toBe('normal string');
      expect(await maybeLoadConfigFromExternalFile(42)).toBe(42);
      expect(await maybeLoadConfigFromExternalFile(true)).toBe(true);
      expect(await maybeLoadConfigFromExternalFile(null)).toBeNull();
      expect(await maybeLoadConfigFromExternalFile(undefined)).toBeUndefined();
    });

    it('should handle deeply nested objects with multiple file references', async () => {
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce('{"nested": {"value": 123}}')
        .mockResolvedValueOnce('["item1", "item2"]')
        .mockResolvedValueOnce('deeply nested content');

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

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
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

    it('should handle arrays with mixed content types including file references', async () => {
      jest
        .mocked(fsPromises.readFile)
        .mockResolvedValueOnce('{"config": "loaded"}')
        .mockResolvedValueOnce('text content')
        .mockResolvedValueOnce('{"config": "loaded"}');

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

      const result = await maybeLoadConfigFromExternalFile(config);

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

    it('should handle edge cases with empty objects and arrays', async () => {
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

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual(config);
    });

    it('should preserve object keys that contain special characters', async () => {
      jest.mocked(fsPromises.readFile).mockResolvedValueOnce('special content');

      const config = {
        'key-with-dashes': 'file://special.txt',
        'key.with.dots': 'normal value',
        'key with spaces': { nested: 'value' },
        'key@with#symbols': ['array', 'value'],
        123: 'numeric key',
        '': 'empty key',
      };

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual({
        'key-with-dashes': 'special content',
        'key.with.dots': 'normal value',
        'key with spaces': { nested: 'value' },
        'key@with#symbols': ['array', 'value'],
        123: 'numeric key',
        '': 'empty key',
      });
    });

    it('should handle objects with prototype pollution attempts safely', async () => {
      jest.mocked(fsPromises.readFile).mockResolvedValueOnce('malicious content');

      const config = {
        __proto__: 'file://malicious.txt',
        constructor: { normal: 'value' },
        prototype: ['safe', 'array'],
        normal: 'safe value',
      };

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual({
        __proto__: 'malicious content',
        constructor: { normal: 'value' },
        prototype: ['safe', 'array'],
        normal: 'safe value',
      });
    });

    it('should handle very large nested structures efficiently', async () => {
      jest.mocked(fsPromises.readFile).mockResolvedValue('file content');

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
      const result = await maybeLoadConfigFromExternalFile(config);

      // Should have loaded the file reference at the deepest level
      expect(fsPromises.readFile).toHaveBeenCalledTimes(1);

      // Verify the structure is preserved
      let current = result;
      for (let i = 10; i > 0; i--) {
        expect(current).toHaveProperty(`level${i}`);
        expect(current).toHaveProperty(`static${i}`, `value at depth ${i}`);
        current = current[`level${i}`];
      }
      expect(current).toBe('file content');
    });

    it('should handle functions and undefined values in objects gracefully', async () => {
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

      const result = await maybeLoadConfigFromExternalFile(config);

      expect(result).toEqual(config);
      expect(result.func).toBe(testFunction);
      expect(result.nested.func2).toBe(testFunction);
    });
  });

  describe('getResolvedRelativePath', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    });

    afterEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    });

    it('returns absolute path unchanged', async () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(getResolvedRelativePath(absolutePath, false)).toBe(absolutePath);
    });

    it('uses process.cwd() when isCloudConfig is true', async () => {
      expect(getResolvedRelativePath('relative/file.txt', true)).toBe(
        path.join('/mock/cwd', 'relative/file.txt'),
      );
    });
  });

  describe('safeResolve', () => {
    it('returns absolute path unchanged', async () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', async () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeResolve('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('resolves relative paths', async () => {
      const expected = path.resolve('base/path', 'relative/file.txt');
      expect(safeResolve('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', async () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.resolve('base', 'path', 'relative/file.txt');
      expect(safeResolve('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', async () => {
      expect(safeResolve()).toBe(path.resolve());
      expect(safeResolve('')).toBe(path.resolve(''));
    });
  });

  describe('safeJoin', () => {
    it('returns absolute path unchanged', async () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', async () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeJoin('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('joins relative paths', async () => {
      const expected = path.join('base/path', 'relative/file.txt');
      expect(safeJoin('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', async () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.join('base', 'path', 'relative/file.txt');
      expect(safeJoin('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', async () => {
      expect(safeJoin()).toBe(path.join());
      expect(safeJoin('')).toBe(path.join(''));
    });
  });
});
