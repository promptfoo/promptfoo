import { getPortkeyHeaders } from '../../src/providers/portkey';

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
});
