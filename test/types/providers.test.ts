import { isApiProvider, isProviderOptions } from '../../src/types/providers';

describe('isApiProvider', () => {
  it('should return true for valid ApiProvider object', () => {
    const validProvider = {
      id: () => 'test-provider',
      callApi: async () => ({ output: 'test' }),
      label: 'Test Provider',
    };

    expect(isApiProvider(validProvider)).toBe(true);
  });

  it('should return false for null/undefined', () => {
    expect(isApiProvider(null)).toBe(false);
    expect(isApiProvider(undefined)).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isApiProvider('string')).toBe(false);
    expect(isApiProvider(123)).toBe(false);
    expect(isApiProvider(true)).toBe(false);
  });

  it('should return false for object missing required properties', () => {
    expect(isApiProvider({})).toBe(false);
    expect(isApiProvider({ id: 'test' })).toBe(false);
    expect(isApiProvider({ callApi: () => ({}) })).toBe(false);
  });

  it('should return false if id is not a function', () => {
    const invalidProvider = {
      id: 'test-provider',
      callApi: async () => ({ output: 'test' }),
    };

    expect(isApiProvider(invalidProvider)).toBe(false);
  });
});

describe('isProviderOptions', () => {
  it('should return true for valid ProviderOptions object', () => {
    const validOptions = {
      id: 'test-provider',
      label: 'Test Provider',
      config: { key: 'value' },
    };

    expect(isProviderOptions(validOptions)).toBe(true);
  });

  it('should return false for null/undefined', () => {
    expect(isProviderOptions(null)).toBe(false);
    expect(isProviderOptions(undefined)).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isProviderOptions('string')).toBe(false);
    expect(isProviderOptions(123)).toBe(false);
    expect(isProviderOptions(true)).toBe(false);
  });

  it('should return false for object missing required properties', () => {
    expect(isProviderOptions({})).toBe(false);
    expect(isProviderOptions({ label: 'Test' })).toBe(false);
  });

  it('should return false if id is not a string', () => {
    const invalidOptions = {
      id: () => 'test',
      label: 'Test Provider',
    };

    expect(isProviderOptions(invalidOptions)).toBe(false);
  });
});
