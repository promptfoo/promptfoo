import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers/index';
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
    expect(getPortkeyHeaders({})).toEqual({});
  });

  // Non-portkey keys are request body params (max_tokens) or promptfoo bookkeeping
  // (basePath). Forwarding them leaked local state and produced invalid header values.
  it.each([
    ['a request body parameter', { max_tokens: 512 }],
    ['promptfoo bookkeeping', { basePath: '/home/user/my-project' }],
    ['a provider credential', { apiKey: 'test-api-key' }],
    ['an arbitrary setting', { regularSetting: 'value', customHost: 'custom.host.com' }],
  ])('should not turn %s into a header', (_, foreign) => {
    const config = { portkeyProvider: '@bedrock-eu', ...foreign };
    expect(getPortkeyHeaders(config)).toEqual({ 'x-portkey-provider': '@bedrock-eu' });
  });

  it('should not produce invalid header values from multiline config strings', () => {
    const headers = getPortkeyHeaders({
      portkeyProvider: '@bedrock-eu',
      instructions: 'line one\nline two',
    });
    expect(headers).toEqual({ 'x-portkey-provider': '@bedrock-eu' });
    expect(() => new Headers(headers)).not.toThrow();
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
    expect(getPortkeyHeaders(config)).toEqual({ 'x-portkey-trace-id': 'explicit' });
  });

  it('should override case-insensitively so the header is not sent twice', () => {
    const config = {
      portkeyTraceId: 'generated',
      headers: { 'X-Portkey-Trace-Id': 'explicit' },
    };
    expect(getPortkeyHeaders(config)).toEqual({ 'X-Portkey-Trace-Id': 'explicit' });
  });

  it('should coerce non-string custom header values', () => {
    const config = {
      headers: { 'x-count': 5, 'x-enabled': true, 'x-obj': { a: 1 }, 'x-skip': null },
    };
    expect(getPortkeyHeaders(config)).toEqual({
      'x-count': '5',
      'x-enabled': 'true',
      'x-obj': JSON.stringify({ a: 1 }),
    });
  });

  it('should ignore a non-object config.headers', () => {
    const config = { portkeyProvider: '@bedrock-eu', headers: 'not-an-object' };
    expect(getPortkeyHeaders(config)).toEqual({ 'x-portkey-provider': '@bedrock-eu' });
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

    it('should prefer the per-provider env override over ambient process env', () => {
      vi.stubEnv('PORTKEY_API_KEY', 'pk-process-env');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyProvider: 'openai' },
        env: { PORTKEY_API_KEY: 'pk-override' },
      });
      expect(provider.config.headers).toMatchObject({ 'x-portkey-api-key': 'pk-override' });
    });

    it('should not copy an environment credential into the persisted config', () => {
      vi.stubEnv('PORTKEY_API_KEY', 'pk-env-key');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyProvider: 'openai' },
      });
      // eval results persist provider config, so the credential must only reach the header.
      expect(provider.config.portkeyApiKey).toBeUndefined();
      expect(provider.config.headers).toMatchObject({ 'x-portkey-api-key': 'pk-env-key' });
    });

    it('should accept a credential supplied directly as a header', () => {
      const provider = new PortkeyChatCompletionProvider('@bedrock-eu/claude', {
        config: { headers: { 'X-Portkey-Api-Key': 'pk-header' } },
      });
      expect(provider.requiresApiKey()).toBe(false);
      const headers = provider.getOpenAiRequestHeaders();
      expect(headers).toMatchObject({ 'X-Portkey-Api-Key': 'pk-header' });
      expect(
        Object.keys(headers).filter((k) => k.toLowerCase() === 'x-portkey-api-key'),
      ).toHaveLength(1);
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

    it('should not forward an explicit apiKey when Portkey holds the credential', () => {
      const provider = new PortkeyChatCompletionProvider('@bedrock-eu/claude', {
        config: { portkeyApiKey: 'pk-config-key', apiKey: 'sk-inherited' },
      });
      expect(provider.getApiKey()).toBeUndefined();
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

  describe('header collisions', () => {
    // The inherited builder adds `Authorization` and then spreads these, so emitting the
    // canonical casing is what lets a caller override replace the generated bearer rather
    // than being joined with it.
    it.each([
      ['provider-level', (h: Record<string, string>) => ({ headers: h }), undefined],
      ['prompt-level', () => ({}), { authorization: 'Bearer explicit' }],
    ])('should canonicalize an %s authorization override', (_, providerCfg, promptHeaders) => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: {
          portkeyApiKey: 'pk-config-key',
          portkeyProvider: 'openai',
          ...providerCfg({ authorization: 'Bearer explicit' }),
        },
      });
      const headers = provider.getOpenAiRequestHeaders(promptHeaders);
      expect(headers).toMatchObject({ Authorization: 'Bearer explicit' });
      expect(Object.keys(headers).filter((k) => k.toLowerCase() === 'authorization')).toHaveLength(
        1,
      );
    });

    it('should keep the portkey credential when a prompt overrides headers', () => {
      const provider = new PortkeyChatCompletionProvider('gpt-4o', {
        config: { portkeyApiKey: 'pk-config-key', portkeyProvider: '@bedrock-eu' },
      });
      // Mirrors the shallow prompt-config merge in OpenAiChatCompletionProvider.
      const headers = provider.getOpenAiRequestHeaders({ 'x-tenant-id': 'acme' });
      expect(headers).toMatchObject({
        'x-portkey-api-key': 'pk-config-key',
        'x-portkey-provider': '@bedrock-eu',
        'x-tenant-id': 'acme',
      });
    });
  });

  it('should name the portkey credential when no key is configured', () => {
    vi.stubEnv('OPENAI_API_KEY', undefined);
    vi.stubEnv('PORTKEY_API_KEY', undefined);
    const provider = new PortkeyChatCompletionProvider('gpt-4o', {
      config: { portkeyProvider: 'openai' },
    });
    expect(provider.requiresApiKey()).toBe(true);
    expect(provider.getApiKey()).toBeUndefined();
  });

  it('should preserve colons in a model catalog reference loaded from a provider id', async () => {
    const provider = await loadApiProvider(
      'portkey:@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
      { options: { config: { portkeyApiKey: 'pk-config-key' } } },
    );
    expect((provider as PortkeyChatCompletionProvider).modelName).toBe(
      '@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
    );
  });
});
