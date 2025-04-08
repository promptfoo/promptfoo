import type { ProviderOptions } from '../../src/types/providers';
import { isApiProvider, isProviderOptions } from '../../src/types/providers';

describe('isApiProvider', () => {
  it('should correctly identify valid ApiProvider objects', () => {
    const validProviders = [
      {
        id: () => 'test-provider',
        callApi: async () => ({ output: 'test' }),
      },
      {
        id: () => 'full-provider',
        callApi: async () => ({ output: 'test' }),
        callEmbeddingApi: async () => ({ embedding: [1, 2, 3] }),
        callClassificationApi: async () => ({ classification: { class1: 0.8 } }),
        config: { temperature: 0.7 },
        delay: 1000,
        getSessionId: () => 'session-123',
        label: 'Test Provider',
        transform: 'toLowerCase()',
      },
      {
        id: () => 'minimal-provider',
        callApi: jest.fn(),
      },
    ];

    validProviders.forEach((provider) => {
      expect(isApiProvider(provider)).toBe(true);
    });
  });

  it('should correctly identify invalid ApiProvider objects', () => {
    const invalidProviders = [
      null,
      undefined,
      {},
      { id: 'string-id' }, // id should be a function
      { id: null },
      { id: undefined },
      { id: 42 },
      'string-provider',
      42,
      true,
      [],
      new Date(),
    ];

    invalidProviders.forEach((provider) => {
      expect(isApiProvider(provider)).toBe(false);
    });
  });

  it('should return false for non-object values', () => {
    expect(isApiProvider('string')).toBe(false);
    expect(isApiProvider(123)).toBe(false);
    expect(isApiProvider(true)).toBe(false);
    expect(isApiProvider(undefined)).toBe(false);
    expect(isApiProvider(null)).toBe(false);
  });

  it('should return false for objects without id property', () => {
    expect(isApiProvider({})).toBe(false);
    expect(isApiProvider({ callApi: () => {} })).toBe(false);
  });

  it('should return false when id exists but is not a function', () => {
    expect(isApiProvider({ id: 'string' })).toBe(false);
    expect(isApiProvider({ id: 123 })).toBe(false);
    expect(isApiProvider({ id: true })).toBe(false);
    expect(isApiProvider({ id: {} })).toBe(false);
    expect(isApiProvider({ id: [] })).toBe(false);
  });
});

describe('isProviderOptions', () => {
  it('should correctly identify valid ProviderOptions objects', () => {
    const validOptions: ProviderOptions[] = [
      {
        id: 'test-provider',
      },
      {
        id: 'full-options',
        label: 'Test Provider',
        config: { temperature: 0.7 },
        prompts: ['Hello, {{name}}!'],
        transform: 'toLowerCase()',
        delay: 1000,
        env: { OPENAI_API_KEY: 'test-key' },
      },
      {
        id: 'minimal-options',
      },
    ];

    validOptions.forEach((options) => {
      expect(isProviderOptions(options)).toBe(true);
    });
  });

  it('should correctly identify invalid ProviderOptions objects', () => {
    const invalidOptions = [
      null,
      undefined,
      {},
      { id: undefined },
      { id: null },
      { id: 42 },
      { id: () => 'function-not-string' },
      { label: 'Missing ID' },
      'string-options',
      42,
      true,
      [],
      new Date(),
    ];

    invalidOptions.forEach((options) => {
      expect(isProviderOptions(options)).toBe(false);
    });
  });

  it('should handle edge cases', () => {
    const edgeCases = [
      { id: 'valid', extraField: 'ignored' },
      { id: 'valid', config: null },
      { id: 'valid', prompts: [] },
      { id: 'valid', delay: 0 },
      { id: 'valid', env: {} },
    ];

    edgeCases.forEach((options) => {
      expect(isProviderOptions(options)).toBe(true);
    });
  });

  it('should return false for non-object values', () => {
    expect(isProviderOptions('string')).toBe(false);
    expect(isProviderOptions(123)).toBe(false);
    expect(isProviderOptions(true)).toBe(false);
    expect(isProviderOptions(undefined)).toBe(false);
    expect(isProviderOptions(null)).toBe(false);
  });

  it('should return false for objects without id property', () => {
    expect(isProviderOptions({})).toBe(false);
    expect(isProviderOptions({ label: 'Test' })).toBe(false);
  });

  it('should return false when id exists but is not a string', () => {
    expect(isProviderOptions({ id: () => 'function' })).toBe(false);
    expect(isProviderOptions({ id: 123 })).toBe(false);
    expect(isProviderOptions({ id: true })).toBe(false);
    expect(isProviderOptions({ id: {} })).toBe(false);
    expect(isProviderOptions({ id: [] })).toBe(false);
  });
});
