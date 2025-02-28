import { describe, expect, it } from 'vitest';
import { validatePath } from './ExtensionEditor';

describe('validatePath', () => {
  it('should return undefined for empty input', () => {
    expect(validatePath('', false)).toBeUndefined();
  });

  it('should return undefined for whitespace input', () => {
    expect(validatePath('   ', false)).toBeUndefined();
  });

  it('should return error for missing function name', () => {
    expect(validatePath('/path/to/file.js', false)).toEqual({
      message: 'Format: /path/to/file.js:hookFunction'
    });
  });

  it('should return error for missing file path', () => {
    expect(validatePath(':hookFunction', false)).toEqual({
      message: 'Format: /path/to/file.js:hookFunction'
    });
  });

  it('should return error for invalid file type', () => {
    expect(validatePath('/path/to/file.txt:hook', false)).toEqual({
      message: 'Must be a JavaScript/TypeScript or Python file'
    });
  });

  it('should accept JavaScript files', () => {
    expect(validatePath('/path/to/file.js:hook', false)).toBeUndefined();
  });

  it('should accept TypeScript files', () => {
    expect(validatePath('/path/to/file.ts:hook', false)).toBeUndefined();
  });

  it('should accept Python files', () => {
    expect(validatePath('/path/to/file.py:hook', false)).toBeUndefined();
  });

  it('should not show format error while typing before colon', () => {
    expect(validatePath('/path/to/file', true)).toBeUndefined();
  });

  it('should show format error while typing after colon', () => {
    expect(validatePath('/path/to/file.js:', true)).toEqual({
      message: 'Format: /path/to/file.js:hookFunction'
    });
  });

  it('should not show file type error while typing', () => {
    expect(validatePath('/path/to/file.t:hook', true)).toBeUndefined();
  });

  it('should handle file protocol prefix', () => {
    expect(validatePath('file:///path/to/file.js:hook', false)).toBeUndefined();
  });
});
