import { describe, it, expect } from '@jest/globals';
import { isApiProvider, isProviderOptions } from '../src/types/providers';
import type { ApiProvider, ProviderOptions } from '../src/types/providers';

// Mock objects for testing
const validApiProvider: ApiProvider = {
  id: () => 'provider-id',
  callApi: async (prompt: string) => ({
    output: `Response for ${prompt}`,
  }),
};

const invalidApiProvider = {
  id: 'not-a-function',
};

const validProviderOptions: ProviderOptions = {
  id: 'provider-id',
  label: 'Test Provider',
};

const invalidProviderOptions = {
  id: 12345, // not a string
};

describe('isApiProvider', () => {
  it('should return true for a valid ApiProvider object', () => {
    expect(isApiProvider(validApiProvider)).toBe(true);
  });

  it('should return false for an invalid ApiProvider object', () => {
    expect(isApiProvider(invalidApiProvider)).toBe(false);
  });

  it('should return false for null input', () => {
    expect(isApiProvider(null)).toBe(false);
  });

  it('should return false for undefined input', () => {
    expect(isApiProvider(undefined)).toBe(false);
  });
});

describe('isProviderOptions', () => {
  it('should return true for a valid ProviderOptions object', () => {
    expect(isProviderOptions(validProviderOptions)).toBe(true);
  });

  it('should return false for an invalid ProviderOptions object', () => {
    expect(isProviderOptions(invalidProviderOptions)).toBe(false);
  });

  it('should return false for null input', () => {
    expect(isProviderOptions(null)).toBe(false);
  });

  it('should return false for undefined input', () => {
    expect(isProviderOptions(undefined)).toBe(false);
  });
});
