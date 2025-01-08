import { describe, it, expect } from '@jest/globals';
import { isApiProvider, isProviderOptions } from '../src/types/providers';
import type { ApiProvider, ProviderOptions } from '../src/types/providers';

describe('isApiProvider', () => {
  it('should return true for a valid ApiProvider object', () => {
    const validApiProvider: ApiProvider = {
      id: () => 'provider-1',
      callApi: async () => ({}),
    };

    expect(isApiProvider(validApiProvider)).toBe(true);
  });

  it('should return false for an object without id function', () => {
    const invalidApiProvider = {
      callApi: async () => ({}),
    };

    expect(isApiProvider(invalidApiProvider)).toBe(false);
  });

  it('should return false for a null object', () => {
    expect(isApiProvider(null)).toBe(false);
  });

  it('should return false for a non-object value', () => {
    expect(isApiProvider('not-an-object')).toBe(false);
  });
});

describe('isProviderOptions', () => {
  it('should return true for a valid ProviderOptions object', () => {
    const validProviderOptions: ProviderOptions = {
      id: 'provider-options-1',
      label: 'Test Provider',
    };

    expect(isProviderOptions(validProviderOptions)).toBe(true);
  });

  it('should return false for an object without id string', () => {
    const invalidProviderOptions = {
      label: 'Test Provider',
    };

    expect(isProviderOptions(invalidProviderOptions)).toBe(false);
  });

  it('should return false for a null object', () => {
    expect(isProviderOptions(null)).toBe(false);
  });

  it('should return false for a non-object value', () => {
    expect(isProviderOptions(12345)).toBe(false);
  });
});
