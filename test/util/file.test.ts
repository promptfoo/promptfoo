import * as fs from 'fs';
import path from 'path';
import cliState from '../../src/cliState';
import { maybeLoadFromExternalFile, parsePathOrGlob } from '../../src/util/file';
import { safeResolve, safeJoin } from '../../src/util/file.node';
import { isJavascriptFile, isImageFile, isVideoFile } from '../../src/util/fileUtils';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
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
    it('identifies image files', () => {
      expect(isImageFile('test.jpg')).toBe(true);
      expect(isImageFile('test.jpeg')).toBe(true);
      expect(isImageFile('test.png')).toBe(true);
      expect(isImageFile('test.gif')).toBe(true);
      expect(isImageFile('test.bmp')).toBe(true);
      expect(isImageFile('test.webp')).toBe(true);
      expect(isImageFile('test.svg')).toBe(true);
      expect(isImageFile('test.txt')).toBe(false);
      expect(isImageFile('test.js')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('identifies video files', () => {
      expect(isVideoFile('test.mp4')).toBe(true);
      expect(isVideoFile('test.webm')).toBe(true);
      expect(isVideoFile('test.ogg')).toBe(true);
      expect(isVideoFile('test.mov')).toBe(true);
      expect(isVideoFile('test.avi')).toBe(true);
      expect(isVideoFile('test.wmv')).toBe(true);
      expect(isVideoFile('test.mkv')).toBe(true);
      expect(isVideoFile('test.m4v')).toBe(true);
      expect(isVideoFile('test.txt')).toBe(false);
      expect(isVideoFile('test.js')).toBe(false);
    });
  });

  describe('safeResolve and safeJoin', () => {
    it('safeResolve should only resolve relative paths', () => {
      const relativePath = 'relative/path';
      const absolutePath = '/absolute/path';
      const fileUrl = getFileUrl('path/to/file');

      expect(safeResolve('/base', relativePath)).toBe(path.resolve('/base', relativePath));
      expect(safeResolve('/base', absolutePath)).toBe(absolutePath);
      expect(safeResolve('/base', fileUrl)).toBe(fileUrl);
    });

    it('safeJoin should only join relative paths', () => {
      const relativePath = 'relative/path';
      const absolutePath = '/absolute/path';
      const fileUrl = getFileUrl('path/to/file');

      expect(safeJoin('/base', relativePath)).toBe(path.join('/base', relativePath));
      expect(safeJoin('/base', absolutePath)).toBe(absolutePath);
      expect(safeJoin('/base', fileUrl)).toBe(fileUrl);
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
  });

  describe('parsePathOrGlob', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should parse a simple file path with extension', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.txt'),
      });
    });

    it('should parse a file path with function name', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file.py:myFunction')).toEqual({
        extension: '.py',
        functionName: 'myFunction',
        isPathPattern: false,
        filePath: path.join('/base', 'file.py'),
      });
    });

    it('should parse a Go file path with function name', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should parse a directory path', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      expect(parsePathOrGlob('/base', 'dir')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', 'dir'),
      });
    });

    it('should handle non-existent file path gracefully when PROMPTFOO_STRICT_FILES is false', () => {
      jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('File does not exist');
      });
      expect(parsePathOrGlob('/base', 'nonexistent.js')).toEqual({
        extension: '.js',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'nonexistent.js'),
      });
    });

    it('should throw an error for non-existent file path when PROMPTFOO_STRICT_FILES is true', () => {
      process.env.PROMPTFOO_STRICT_FILES = 'true';
      jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('File does not exist');
      });
      expect(() => parsePathOrGlob('/base', 'nonexistent.js')).toThrow('File does not exist');
      delete process.env.PROMPTFOO_STRICT_FILES;
    });

    it('should properly test file existence when function name in the path', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      parsePathOrGlob('/base', 'script.py:myFunction');
      expect(fs.statSync).toHaveBeenCalledWith(path.join('/base', 'script.py'));
    });

    it('should handle file:// prefix', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('', 'file://file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: 'file.txt',
      });
    });
  });
});
