import * as fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

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

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
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
      jest.resetAllMocks();
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
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
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

      const result = maybeLoadFromExternalFile('file://test.json');
      expect(result).toEqual(mockData);
    });

    it('should load YAML files', () => {
      const mockData = { key: 'value' };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockData));

      const result = maybeLoadFromExternalFile('file://test.yaml');
      expect(result).toEqual(mockData);
    });

    it('should load CSV files', () => {
      const csvContent = 'name,age\nJohn,30\nJane,25';
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

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

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fs.readFileSync)
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

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockData1))
        .mockReturnValueOnce(JSON.stringify(mockData2));

      const result = maybeLoadFromExternalFile('file://data*.json');
      expect(result).toEqual([mockData1, mockData2]);
    });

    it('should handle glob patterns with arrays in files', () => {
      const mockFiles = ['/mock/base/path/tests1.yaml', '/mock/base/path/tests2.yaml'];
      const mockData1 = [{ test: 'a' }, { test: 'b' }];
      const mockData2 = [{ test: 'c' }, { test: 'd' }];

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce(yaml.dump(mockData1))
        .mockReturnValueOnce(yaml.dump(mockData2));

      const result = maybeLoadFromExternalFile('file://tests*.yaml');
      expect(result).toEqual([{ test: 'a' }, { test: 'b' }, { test: 'c' }, { test: 'd' }]);
    });

    it('should handle single-column CSV files consistently with glob patterns', () => {
      const mockFiles = ['/mock/base/path/data1.csv', '/mock/base/path/data2.csv'];
      const csvContent1 = 'name\nAlice\nBob';
      const csvContent2 = 'name\nCharlie\nDavid';

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce(csvContent1)
        .mockReturnValueOnce(csvContent2);

      const result = maybeLoadFromExternalFile('file://data*.csv');
      // Should return array of values, not objects
      expect(result).toEqual(['Alice', 'Bob', 'Charlie', 'David']);
    });

    it('should handle multi-column CSV files with glob patterns', () => {
      const mockFiles = ['/mock/base/path/users.csv'];
      const csvContent = 'name,age\nAlice,30\nBob,25';

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

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

      jest.mocked(globSync).mockReturnValue(mockFiles);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce('') // Empty file
        .mockReturnValueOnce(yaml.dump(mockData));

      const result = maybeLoadFromExternalFile('file://**.yaml');
      // Should skip empty file and only include valid data
      expect(result).toEqual([mockData]);
    });

    it('should throw error when glob pattern matches no files', () => {
      jest.mocked(globSync).mockReturnValue([]);

      expect(() => maybeLoadFromExternalFile('file://nonexistent/*.yaml')).toThrow(
        `No files found matching pattern: ${path.resolve('/mock/base/path', 'nonexistent/*.yaml')}`,
      );
    });

    it('should throw error when file does not exist', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => maybeLoadFromExternalFile('file://nonexistent.yaml')).toThrow(
        `File does not exist: ${path.resolve('/mock/base/path', 'nonexistent.yaml')}`,
      );
    });

    it('should handle arrays of file paths', () => {
      const mockData1 = { key: 'value1' };
      const mockData2 = { key: 'value2' };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockData1))
        .mockReturnValueOnce(JSON.stringify(mockData2));

      const result = maybeLoadFromExternalFile(['file://test1.json', 'file://test2.json']);
      expect(result).toEqual([mockData1, mockData2]);
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
