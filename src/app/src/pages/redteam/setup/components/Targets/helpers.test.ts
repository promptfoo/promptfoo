import { describe, it, expect } from 'vitest';
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
  ])(
    'should return the substring before the first colon for $description ("$providerId")',
    ({ providerId, expected }) => {
      const result = getProviderType(providerId);

      expect(result).toBe(expected);
    },
  );

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
  ])(
    'should return the providerId itself for direct provider types like $description ("$providerId")',
    ({ providerId, expected }) => {
      const result = getProviderType(providerId);

      expect(result).toBe(expected);
    },
  );
});
