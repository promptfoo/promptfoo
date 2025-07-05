import * as fs from 'fs';
import path from 'path';
import cliState from '../../src/cliState';
import {
  maybeLoadFromExternalFile,
  getResolvedRelativePath,
  maybeLoadConfigFromExternalFile,
} from '../../src/util/file';
import { safeResolve, safeJoin } from '../../src/util/file.node';
import {
  isJavascriptFile,
  isImageFile,
  isVideoFile,
  isAudioFile,
} from '../../src/util/fileExtensions';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

describe('file utilities', () => {
  // Helper to create platform-appropriate file URLs
  const getFileUrl = (path: string) => {
    return process.platform === 'win32'
      ? `file:///C:/${path.replace(/\\/g, '/')}`
      : `file:///${path}`;
  };

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
    const mockJsonContent = '{"key": "value"}';
    const mockYamlContent = 'key: value';

    beforeEach(() => {
      jest.resetAllMocks();
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
    });

    it('should return the input if it is not a string', () => {
      const input = { key: 'value' };
      expect(maybeLoadFromExternalFile(input)).toBe(input);
    });

    it('should return the input if it does not start with "file://"', () => {
      const input = 'not a file path';
      expect(maybeLoadFromExternalFile(input)).toBe(input);
    });

    it('should throw an error if the file does not exist', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => maybeLoadFromExternalFile('file://nonexistent.txt')).toThrow(
        'File does not exist',
      );
    });

    it('should return the file contents for a non-JSON, non-YAML file', () => {
      expect(maybeLoadFromExternalFile('file://test.txt')).toBe(mockFileContent);
    });

    it('should parse and return JSON content for a .json file', () => {
      jest.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);
      expect(maybeLoadFromExternalFile('file://test.json')).toEqual({ key: 'value' });
    });

    it('should parse and return YAML content for a .yaml file', () => {
      jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
      expect(maybeLoadFromExternalFile('file://test.yaml')).toEqual({ key: 'value' });
    });

    it('should parse and return YAML content for a .yml file', () => {
      jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
      expect(maybeLoadFromExternalFile('file://test.yml')).toEqual({ key: 'value' });
    });

    it('should use basePath when resolving file paths', () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle relative paths correctly', () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file://test.txt');

      const expectedPath = path.resolve(basePath, 'test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle a path with environment variables in Nunjucks template', () => {
      process.env.TEST_ROOT_PATH = '/root/dir';
      const input = 'file://{{ env.TEST_ROOT_PATH }}/test.txt';

      jest.mocked(fs.existsSync).mockReturnValue(true);

      const expectedPath = path.resolve(`${process.env.TEST_ROOT_PATH}/test.txt`);
      maybeLoadFromExternalFile(input);

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      delete process.env.TEST_ROOT_PATH;
    });

    it('should ignore basePath when file path is absolute', () => {
      const basePath = '/base/path';
      cliState.basePath = basePath;
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      maybeLoadFromExternalFile('file:///absolute/path/test.txt');

      const expectedPath = path.resolve('/absolute/path/test.txt');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

      cliState.basePath = undefined;
    });

    it('should handle list of paths', () => {
      const basePath = './relative/path';
      cliState.basePath = basePath;
      const input = ['file://test1.txt', 'file://test2.txt', 'file://test3.txt'];

      // Mock readFileSync to return consistent data
      const mockFileData = 'test content';
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileData);

      maybeLoadFromExternalFile(input);

      expect(fs.existsSync).toHaveBeenCalledTimes(3);
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test1.txt'));
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test2.txt'));
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve(basePath, 'test3.txt'));

      expect(fs.readFileSync).toHaveBeenCalledTimes(3);
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test1.txt'), 'utf8');
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test2.txt'), 'utf8');
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(basePath, 'test3.txt'), 'utf8');

      cliState.basePath = undefined;
    });

    it('should recursively load file references in objects', () => {
      jest.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": 1}').mockReturnValueOnce('bar');

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
      jest.mocked(fs.readFileSync).mockReturnValueOnce('test content');

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
      jest
        .mocked(fs.readFileSync)
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
      jest
        .mocked(fs.readFileSync)
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
      jest.mocked(fs.readFileSync).mockReturnValueOnce('special content');

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
      jest.mocked(fs.readFileSync).mockReturnValueOnce('malicious content');

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
      jest.mocked(fs.readFileSync).mockReturnValue('file content');

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
  });

  describe('getResolvedRelativePath', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    });

    afterEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(originalCwd);
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

  describe('safeResolve', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeResolve('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('resolves relative paths', () => {
      const expected = path.resolve('base/path', 'relative/file.txt');
      expect(safeResolve('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.resolve('base', 'path', 'relative/file.txt');
      expect(safeResolve('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeResolve()).toBe(path.resolve());
      expect(safeResolve('')).toBe(path.resolve(''));
    });
  });

  describe('safeJoin', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeJoin('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('joins relative paths', () => {
      const expected = path.join('base/path', 'relative/file.txt');
      expect(safeJoin('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.join('base', 'path', 'relative/file.txt');
      expect(safeJoin('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeJoin()).toBe(path.join());
      expect(safeJoin('')).toBe(path.join(''));
    });
  });
});
