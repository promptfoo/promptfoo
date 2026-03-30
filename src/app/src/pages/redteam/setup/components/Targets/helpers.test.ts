import { describe, expect, it } from 'vitest';
import { getProviderType } from './helpers';

describe('getProviderType', () => {
  it.each([
    {
      providerId: 'openrouter:openai/gpt-4o',
      expected: 'openrouter',
      description: 'a standard provider ID with a model',
    },
    {
      providerId: 'azure:chat:',
      expected: 'azure',
      description: 'a provider ID with a trailing colon',
    },
  ])('should return the substring before the first colon for $description ("$providerId")', ({
    providerId,
    expected,
  }) => {
    const result = getProviderType(providerId);

    expect(result).toBe(expected);
  });

  it('should return "exec" for provider IDs like "exec: python script.py"', () => {
    const providerId = 'exec: python script.py';
    const expected = 'exec';
    const result = getProviderType(providerId);
    expect(result).toBe(expected);
  });

  it('should return the substring before the first colon when multiple colons are present', () => {
    const providerId = 'bedrock:anthropic.claude-3-sonnet-20240229-v1:0';
    const expected = 'bedrock';

    const result = getProviderType(providerId);

    expect(result).toBe(expected);
  });

  it.each([
    { providerId: 'http', expected: 'http', description: 'http provider' },
    { providerId: 'websocket', expected: 'websocket', description: 'websocket provider' },
    { providerId: 'custom', expected: 'custom', description: 'custom provider' },
  ])('should return the providerId itself for direct provider types like $description ("$providerId")', ({
    providerId,
    expected,
  }) => {
    const result = getProviderType(providerId);

    expect(result).toBe(expected);
  });

  describe('file:// path handling', () => {
    // Note: Due to the implementation checking includes(':') before startsWith('file://'),
    // all file:// URLs are caught by the colon check and return 'file' as the provider type.
    // The file extension logic (lines 12-30) is currently unreachable.
    it('should return "file" for file:// paths with .js extension', () => {
      expect(getProviderType('file://path/to/script.js')).toBe('file');
      expect(getProviderType('file://script.js')).toBe('file');
      expect(getProviderType('file:///absolute/path/script.js')).toBe('file');
    });

    it('should return "file" for file:// paths with .ts extension', () => {
      expect(getProviderType('file://path/to/script.ts')).toBe('file');
      expect(getProviderType('file://script.ts')).toBe('file');
      expect(getProviderType('file:///absolute/path/script.ts')).toBe('file');
    });

    it('should return "file" for file:// paths with .py extension', () => {
      expect(getProviderType('file://path/to/script.py')).toBe('file');
      expect(getProviderType('file://script.py')).toBe('file');
      expect(getProviderType('file:///absolute/path/script.py')).toBe('file');
    });

    it('should return "file" for file:// paths with .go extension', () => {
      expect(getProviderType('file://path/to/main.go')).toBe('file');
      expect(getProviderType('file://main.go')).toBe('file');
      expect(getProviderType('file:///absolute/path/main.go')).toBe('file');
    });

    it('should return "file" for file:// paths with .sh extension', () => {
      expect(getProviderType('file://path/to/script.sh')).toBe('file');
      expect(getProviderType('file://script.sh')).toBe('file');
      expect(getProviderType('file:///absolute/path/script.sh')).toBe('file');
    });

    it('should return "file" for file:// paths with .bat extension', () => {
      expect(getProviderType('file://path/to/script.bat')).toBe('file');
      expect(getProviderType('file://script.bat')).toBe('file');
      expect(getProviderType('file:///C:/path/script.bat')).toBe('file');
    });

    it('should return "file" for file:// paths with .cmd extension', () => {
      expect(getProviderType('file://path/to/script.cmd')).toBe('file');
      expect(getProviderType('file://script.cmd')).toBe('file');
    });

    it('should return "file" for file:// paths with .ps1 extension', () => {
      expect(getProviderType('file://path/to/script.ps1')).toBe('file');
      expect(getProviderType('file://script.ps1')).toBe('file');
    });

    it('should return "file" for file:// paths without recognized extensions', () => {
      expect(getProviderType('file://path/to/file.txt')).toBe('file');
      expect(getProviderType('file://path/to/file')).toBe('file');
      expect(getProviderType('file://path/to/file.unknown')).toBe('file');
    });

    it('should return "file" for file:// paths with complex nested directories', () => {
      expect(getProviderType('file://deeply/nested/path/with/many/dirs/script.py')).toBe('file');
      expect(getProviderType('file:///var/www/app/scripts/handler.js')).toBe('file');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for undefined input', () => {
      expect(getProviderType(undefined)).toBe(undefined);
    });

    it('should return undefined for empty string', () => {
      expect(getProviderType('')).toBe(undefined);
    });

    it('should handle provider IDs with only a colon', () => {
      expect(getProviderType(':')).toBe('');
    });

    it('should handle provider IDs starting with colon', () => {
      expect(getProviderType(':model')).toBe('');
    });
  });
});
