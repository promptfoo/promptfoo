import * as fs from 'fs';
import * as path from 'path';
import { maybeFilePath, normalizeInput, parsePathOrGlob } from '../src/prompts/utils';

jest.mock('fs', () => ({
  statSync: jest.fn(jest.requireActual('fs').statSync),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(jest.requireActual('glob').globSync),
}));

describe('maybeFilePath', () => {
  it('should return true for valid file paths', () => {
    expect(maybeFilePath('C:\\path\\to\\file.txt')).toBe(true);
    expect(maybeFilePath('file.*')).toBe(true);
    expect(maybeFilePath('filename.ext')).toBe(true);
    expect(maybeFilePath('path/to/file.txt')).toBe(true);
  });

  it('should return false for strings with new lines', () => {
    expect(maybeFilePath('path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('file\nname.ext')).toBe(false);
  });

  it('should return false for strings with "portkey://"', () => {
    expect(maybeFilePath('portkey://path/to/file')).toBe(false);
  });

  it('should return false for strings with "langfuse://"', () => {
    expect(maybeFilePath('langfuse://path/to/file')).toBe(false);
  });

  it('should return false for strings without file path indicators', () => {
    expect(maybeFilePath('anotherstring')).toBe(false);
    expect(maybeFilePath('justastring')).toBe(false);
    expect(maybeFilePath('stringwith.dotbutnotfile')).toBe(false);
  });

  it('should return true for strings with file:// prefix', () => {
    expect(maybeFilePath('file://path/to/file.txt')).toBe(true);
  });

  it('should return true for strings with wildcard character', () => {
    expect(maybeFilePath('*.txt')).toBe(true);
    expect(maybeFilePath('path/to/*.txt')).toBe(true);
  });

  it('should return true for strings with file extension at the third or fourth last position', () => {
    expect(maybeFilePath('file.ext')).toBe(true);
    expect(maybeFilePath('file.name.ext')).toBe(true);
    expect(maybeFilePath('filename.e')).toBe(false);
    expect(maybeFilePath('filename.ex')).toBe(true);
  });

  it('should work for files that end with specific allowed extensions', () => {
    expect(maybeFilePath('filename.cjs')).toBe(true);
    expect(maybeFilePath('filename.js')).toBe(true);
    expect(maybeFilePath('filename.js:functionName')).toBe(true);
    expect(maybeFilePath('filename.json')).toBe(true);
    expect(maybeFilePath('filename.jsonl')).toBe(true);
    expect(maybeFilePath('filename.mjs')).toBe(true);
    expect(maybeFilePath('filename.py')).toBe(true);
    expect(maybeFilePath('filename.py:functionName')).toBe(true);
    expect(maybeFilePath('filename.txt')).toBe(true);
  });

  // Additional tests
  it('should return false for empty strings', () => {
    expect(maybeFilePath('')).toBe(false);
  });

  it('should return false for whitespace strings', () => {
    expect(maybeFilePath('   ')).toBe(false);
    expect(maybeFilePath('\t')).toBe(false);
  });

  it('should return false for non-string inputs', () => {
    expect(() => maybeFilePath(123 as never)).toThrow('Invalid input: 123');
    expect(() => maybeFilePath({} as never)).toThrow('Invalid input: {}');
    expect(() => maybeFilePath([] as never)).toThrow('Invalid input: []');
  });

  it('should return false for strings with invalid and valid indicators mixed', () => {
    expect(maybeFilePath('file://path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('path/to/file.txtportkey://')).toBe(false);
  });

  it('should return true for very long valid file paths', () => {
    const longPath = 'a/'.repeat(100) + 'file.txt';
    expect(maybeFilePath(longPath)).toBe(true);
  });

  it('should return false for very long invalid file paths', () => {
    const longInvalidPath = 'a/'.repeat(100) + 'file\n.txt';
    expect(maybeFilePath(longInvalidPath)).toBe(false);
  });
});

describe('normalizeInput', () => {
  it('rejects invalid input types', () => {
    expect(() => normalizeInput(null as any)).toThrow('Invalid input prompt: null');
    expect(() => normalizeInput(undefined as any)).toThrow('Invalid input prompt: undefined');
    expect(() => normalizeInput(1 as any)).toThrow('Invalid input prompt: 1');
    expect(() => normalizeInput(true as any)).toThrow('Invalid input prompt: true');
    expect(() => normalizeInput(false as any)).toThrow('Invalid input prompt: false');
  });

  it('rejects empty inputs', () => {
    expect(() => normalizeInput([])).toThrow('Invalid input prompt: []');
    expect(() => normalizeInput({} as any)).toThrow('Invalid input prompt: {}');
    expect(() => normalizeInput('')).toThrow('Invalid input prompt: ""');
  });

  it('returns array with single string when input is a non-empty string', () => {
    expect(normalizeInput('valid string')).toEqual([{ raw: 'valid string' }]);
  });

  it('returns input array when input is a non-empty array', () => {
    const inputArray = ['prompt1', { raw: 'prompt2' }];
    expect(normalizeInput(inputArray)).toEqual([{ raw: 'prompt1' }, { raw: 'prompt2' }]);
  });

  // NOTE: Legacy mode. This is deprecated and will be removed in a future version.
  it('returns array of prompts when input is an object', () => {
    const inputObject = {
      'prompts1.txt': 'label A',
      'prompts2.txt': 'label B',
    };
    expect(normalizeInput(inputObject)).toEqual([
      {
        label: 'label A',
        raw: 'prompts1.txt',
      },
      {
        label: 'label B',
        raw: 'prompts2.txt',
      },
    ]);
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
      promptPath: path.join('/base', 'file.txt'),
    });
  });

  it('should parse a file path with function name', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.py:myFunction')).toEqual({
      extension: '.py',
      functionName: 'myFunction',
      isPathPattern: false,
      promptPath: path.join('/base', 'file.py'),
    });
  });

  it('should parse a directory path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(parsePathOrGlob('/base', 'dir')).toEqual({
      extension: undefined,
      functionName: undefined,
      isPathPattern: true,
      promptPath: path.join('/base', 'dir'),
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
      promptPath: path.join('/base', 'nonexistent.js'),
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

  it('should return empty extension for files without extension', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file')).toEqual({
      extension: '',
      functionName: undefined,
      isPathPattern: false,
      promptPath: path.join('/base', 'file'),
    });
  });

  it('should handle relative paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('./base', 'file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      promptPath: path.join('./base', 'file.txt'),
    });
  });

  it('should handle paths with environment variables', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    process.env.FILE_PATH = 'file.txt';
    expect(parsePathOrGlob('/base', process.env.FILE_PATH)).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      promptPath: path.join('/base', 'file.txt'),
    });
    delete process.env.FILE_PATH;
  });

  it('should handle glob patterns in file path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', '*.js')).toEqual({
      extension: undefined,
      functionName: undefined,
      isPathPattern: true,
      promptPath: path.join('/base', '*.js'),
    });
  });

  it('should handle complex file paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'dir/subdir/file.py:func')).toEqual({
      extension: '.py',
      functionName: 'func',
      isPathPattern: false,
      promptPath: path.join('/base', 'dir/subdir/file.py'),
    });
  });

  it('should handle non-standard file extensions', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.customext')).toEqual({
      extension: '.customext',
      functionName: undefined,
      isPathPattern: false,
      promptPath: path.join('/base', 'file.customext'),
    });
  });

  it('should handle deeply nested file paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g/file.py:func')).toEqual({
      extension: '.py',
      functionName: 'func',
      isPathPattern: false,
      promptPath: path.join('/base', 'a/b/c/d/e/f/g/file.py'),
    });
  });

  it('should handle complex directory paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g')).toEqual({
      extension: undefined,
      functionName: undefined,
      isPathPattern: true,
      promptPath: path.join('/base', 'a/b/c/d/e/f/g'),
    });
  });

  it('should join basePath and safeFilename correctly', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    const basePath = 'base';
    const relativePath = 'relative/path/to/file.txt';
    expect(parsePathOrGlob(basePath, relativePath)).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      promptPath: expect.stringMatching(/base[\\\/]relative[\\\/]path[\\\/]to[\\\/]file.txt/),
    });
  });
});
