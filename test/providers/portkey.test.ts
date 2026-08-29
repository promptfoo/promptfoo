import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPortkeyHeaders,
  PortkeyChatCompletionProvider,
  toKebabCase,
} from '../../src/providers/portkey';

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

  it('should not turn non-portkey config keys into headers', () => {
    const config = {
      apiKey: 'test-api-key',
      customHost: 'custom.host.com',
      max_tokens: 512,
    };
    expect(getPortkeyHeaders(config)).toEqual({});
  });

  it('should not leak promptfoo bookkeeping keys into headers', () => {
    const config = {
      portkeyProvider: '@bedrock-eu',
      basePath: '/home/user/my-project',
    };
    expect(getPortkeyHeaders(config)).toEqual({
      'x-portkey-provider': '@bedrock-eu',
    });
  });

  it('should not emit a header for the promptfoo-only portkeyApiBaseUrl key', () => {
    const config = {
      portkeyApiKey: 'test-api-key',
      portkeyApiBaseUrl: 'https://gateway.internal/v1',
    };
    expect(getPortkeyHeaders(config)).toEqual({
      'x-portkey-api-key': 'test-api-key',
    });
  });

  it('should not produce invalid header values from multiline config strings', () => {
    const config = {
      portkeyProvider: '@bedrock-eu',
      instructions: 'line one\nline two',
    };
    const headers = getPortkeyHeaders(config);
    expect(headers).toEqual({ 'x-portkey-provider': '@bedrock-eu' });
    expect(() => new Headers(headers)).not.toThrow();
  });

  it('should merge custom headers from config.headers', () => {
    const config = {
      portkeyProvider: '@bedrock-eu',
      headers: { 'x-my-custom': 'my-value' },
    };
    expect(getPortkeyHeaders(config)).toEqual({
      'x-portkey-provider': '@bedrock-eu',
      'x-my-custom': 'my-value',
    });
  });

  it('should let config.headers override a generated portkey header', () => {
    const config = {
      portkeyTraceId: 'generated',
      headers: { 'x-portkey-trace-id': 'explicit' },
    };
    expect(getPortkeyHeaders(config)).toEqual({
      'x-portkey-trace-id': 'explicit',
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
      'x-portkey-custom-host': 'custom.host.com',
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

describe('PortkeyChatCompletionProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('portkey credential', () => {
    it('should send portkeyApiKey in the x-portkey-api-key header', () => {
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyApiKey: 'pk-config-key' },
      });
      expect(provider.config.headers).toMatchObject({ 'x-portkey-api-key': 'pk-config-key' });
    });

    it('should send PORTKEY_API_KEY from the environment in the x-portkey-api-key header', () => {
      vi.stubEnv('PORTKEY_API_KEY', 'pk-env-key');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyProvider: 'openai' },
      });
      expect(provider.config.headers).toMatchObject({ 'x-portkey-api-key': 'pk-env-key' });
    });

    it('should not require a bearer token when a portkey key is configured', () => {
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyApiKey: 'pk-config-key' },
      });
      expect(provider.requiresApiKey()).toBe(false);
    });

    it('should respect an explicit apiKeyRequired setting', () => {
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyApiKey: 'pk-config-key', apiKeyRequired: true },
      });
      expect(provider.requiresApiKey()).toBe(true);
    });
  });

  describe('upstream provider credential', () => {
    it('should forward OPENAI_API_KEY as the bearer when Portkey passes through to a provider', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      vi.stubEnv('PORTKEY_API_KEY', 'pk-env-key');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyProvider: 'openai' },
      });
      expect(provider.getApiKey()).toBe('sk-openai');
    });

    it('should never send the portkey key as the bearer token', () => {
      vi.stubEnv('OPENAI_API_KEY', undefined);
      vi.stubEnv('PORTKEY_API_KEY', 'pk-env-key');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyProvider: 'openai' },
      });
      expect(provider.getApiKey()).toBeUndefined();
    });

    it('should prefer an explicit apiKey over the environment', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { apiKey: 'sk-explicit', portkeyProvider: 'openai' },
      });
      expect(provider.getApiKey()).toBe('sk-explicit');
    });

    it.each([
      ['model catalog slug in the model name', '@bedrock-eu/claude', {}],
      ['model catalog slug in portkeyProvider', 'claude', { portkeyProvider: '@bedrock-eu' }],
      ['legacy virtual key', 'claude', { portkeyVirtualKey: 'bedrock-prod' }],
    ])(
      'should not leak OPENAI_API_KEY when Portkey holds the credential (%s)',
      (_, model, config) => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
        const provider = new PortkeyChatCompletionProvider(model, {
          config: { portkeyApiKey: 'pk-config-key', ...config },
        });
        expect(provider.getApiKey()).toBeUndefined();
      },
    );
  });

  it('should keep the model name intact, including colons', () => {
    const provider = new PortkeyChatCompletionProvider(
      '@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
      { config: { portkeyApiKey: 'pk-config-key' } },
    );
    expect(provider.modelName).toBe('@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0');
  });
});
