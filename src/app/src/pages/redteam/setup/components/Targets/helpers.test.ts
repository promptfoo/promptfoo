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
    it.each([
      ['file://path/to/script.js', 'javascript'],
      ['file://script.js', 'javascript'],
      ['file:///absolute/path/script.js', 'javascript'],
      ['file://path/to/script.ts', 'javascript'],
      ['file://script.ts', 'javascript'],
      ['file:///absolute/path/script.ts', 'javascript'],
      ['file://./provider.js:myFunc', 'javascript'],
      ['file://path/to/script.py', 'python'],
      ['file://script.py', 'python'],
      ['file:///absolute/path/script.py', 'python'],
      ['file:///path/to/script.py:custom_func', 'python'],
      ['file://path/to/main.go', 'go'],
      ['file://main.go', 'go'],
      ['file:///absolute/path/main.go', 'go'],
      ['file://path/to/script.sh', 'shell'],
      ['file://script.sh', 'shell'],
      ['file:///absolute/path/script.sh', 'shell'],
      ['file://path/to/script.bat', 'shell'],
      ['file://script.bat', 'shell'],
      ['file:///C:/path/script.bat', 'shell'],
      ['file://path/to/script.cmd', 'shell'],
      ['file://script.cmd', 'shell'],
      ['file://path/to/script.ps1', 'shell'],
      ['file://script.ps1', 'shell'],
    ])('should infer %s as %s', (providerId, expected) => {
      expect(getProviderType(providerId)).toBe(expected);
    });

    it('should return "file" for file:// paths without recognized extensions', () => {
      expect(getProviderType('file://path/to/file.txt')).toBe('file');
      expect(getProviderType('file://path/to/file')).toBe('file');
      expect(getProviderType('file://path/to/file.unknown')).toBe('file');
    });

    it('should return "file" for file:// paths with complex nested directories', () => {
      expect(getProviderType('file://deeply/nested/path/with/many/dirs/script.py')).toBe('python');
      expect(getProviderType('file:///var/www/app/scripts/handler.js')).toBe('javascript');
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
