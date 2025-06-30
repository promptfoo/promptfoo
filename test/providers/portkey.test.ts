import { getPortkeyHeaders, toKebabCase } from '../../src/providers/portkey';

describe('toKebabCase', () => {
  it('should convert simple camelCase to kebab-case', () => {
    expect(toKebabCase('camelCase')).toBe('camel-case');
    expect(toKebabCase('thisIsSimple')).toBe('this-is-simple');
  });

  it('should handle empty string', () => {
    expect(toKebabCase('')).toBe('');
  });

  it('should handle single word', () => {
    expect(toKebabCase('word')).toBe('word');
    expect(toKebabCase('WORD')).toBe('word');
  });

  it('should preserve existing kebab-case', () => {
    expect(toKebabCase('already-kebab-case')).toBe('already-kebab-case');
  });

  it('should handle single letters', () => {
    expect(toKebabCase('a')).toBe('a');
    expect(toKebabCase('A')).toBe('a');
  });
});

describe('getPortkeyHeaders', () => {
  it('should return headers with correct format for portkey config keys', () => {
    const config = {
      portkeyApiKey: 'test-api-key',
      portkeyCustomHost: 'custom.host.com',
      portkeyMetadata: { key1: 'value1', key2: 'value2' },
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      'x-portkey-api-key': 'test-api-key',
      'x-portkey-custom-host': 'custom.host.com',
      'x-portkey-metadata': JSON.stringify({ key1: 'value1', key2: 'value2' }),
    });
  });

  it('should ignore config keys with undefined or null values', () => {
    const config = {
      portkeyApiKey: 'test-api-key',
      portkeyCustomHost: undefined,
      portkeyMetadata: null,
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      'x-portkey-api-key': 'test-api-key',
    });
  });

  it('should handle empty config object', () => {
    const config = {};
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({});
  });

  it('should handle non-portkey config keys without modification', () => {
    const config = {
      apiKey: 'test-api-key',
      customHost: 'custom.host.com',
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      apiKey: 'test-api-key',
      customHost: 'custom.host.com',
    });
  });

  it('should handle mixed portkey and non-portkey config keys', () => {
    const config = {
      portkeyApiKey: 'test-portkey',
      apiKey: 'test-regular',
      portkeyCustomHost: 'custom.host.com',
      regularSetting: 'value',
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      'x-portkey-api-key': 'test-portkey',
      apiKey: 'test-regular',
      'x-portkey-custom-host': 'custom.host.com',
      regularSetting: 'value',
    });
  });

  it('should handle boolean values', () => {
    const config = {
      portkeyFeatureFlag: true,
      portkeyAnotherFlag: false,
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      'x-portkey-feature-flag': 'true',
      'x-portkey-another-flag': 'false',
    });
  });

  it('should handle numeric values', () => {
    const config = {
      portkeyTimeout: 1000,
      portkeyRetries: 3,
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({
      'x-portkey-timeout': '1000',
      'x-portkey-retries': '3',
    });
  });
});
