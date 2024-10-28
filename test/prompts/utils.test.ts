import { maybeFilePath, normalizeInput } from '../../src/prompts/utils';

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

  it('should return false for strings with "helicone://"', () => {
    expect(maybeFilePath('helicone://path/to/file')).toBe(false);
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
    const longPath = `${'a/'.repeat(100)}file.txt`;
    expect(maybeFilePath(longPath)).toBe(true);
  });

  it('should return false for very long invalid file paths', () => {
    const longInvalidPath = `${'a/'.repeat(100)}file\n.txt`;
    expect(maybeFilePath(longInvalidPath)).toBe(false);
  });

  it('should return false for strings ending with a dot', () => {
    expect(maybeFilePath('Write a tweet about {{topic}}.')).toBe(false);
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
