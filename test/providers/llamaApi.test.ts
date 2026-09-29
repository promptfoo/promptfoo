import { describe, expect, it } from 'vitest';
import { createLlamaApiProvider, LlamaApiProvider } from '../../src/providers/llamaApi';

import type { EnvOverrides } from '../../src/types/env';
import type { ProviderOptions } from '../../src/types/index';

describe('LlamaApiProvider', () => {
  describe('constructor', () => {
    it('should initialize with the Llama API defaults', () => {
      const provider = new LlamaApiProvider('test-model');

      expect(provider.modelName).toBe('test-model');
      expect(provider.config).toEqual({
        apiBaseUrl: 'https://api.llama.com/compat/v1',
        apiKeyEnvar: 'LLAMA_API_KEY',
        passthrough: {},
      });
    });

    it('should preserve custom options while enforcing Llama API connection settings', () => {
      const passthrough = { custom_param: 'value' };
      const env: EnvOverrides = { LLAMA_API_KEY: 'dummy' };
      const options: ProviderOptions = {
        id: 'custom-id',
        env,
        config: {
          temperature: 0.7,
          max_tokens: 1000,
          apiBaseUrl: 'https://example.com/v1',
          apiKeyEnvar: 'CUSTOM_API_KEY',
          passthrough,
        },
      };

      const provider = new LlamaApiProvider('test-model', options);

      expect(provider.config).toEqual({
        temperature: 0.7,
        max_tokens: 1000,
        apiBaseUrl: 'https://api.llama.com/compat/v1',
        apiKeyEnvar: 'LLAMA_API_KEY',
        passthrough,
      });
      expect(provider.config.passthrough).not.toBe(passthrough);
      expect(provider.env).toBe(env);
      expect(provider.id()).toBe('custom-id');
    });
  });

  it('should retain its class name, provider prefix, and string representation', () => {
    const provider = new LlamaApiProvider('vendor:model');

    expect(LlamaApiProvider.name).toBe('LlamaApiProvider');
    expect(provider.id()).toBe('llamaapi:vendor:model');
    expect(provider.toString()).toBe('[Llama API Provider vendor:model]');
  });

  it('should redact apiKey from JSON without mutating the provider config', () => {
    const provider = new LlamaApiProvider('test-model', {
      config: { apiKey: 'secret', temperature: 0.5 },
    });

    expect(provider.toJSON()).toEqual({
      provider: 'llamaapi',
      model: 'test-model',
      config: {
        temperature: 0.5,
        apiBaseUrl: 'https://api.llama.com/compat/v1',
        apiKeyEnvar: 'LLAMA_API_KEY',
        passthrough: {},
      },
    });
    expect(provider.config.apiKey).toBe('secret');
  });
});

describe('createLlamaApiProvider', () => {
  it.each([
    ['llamaapi:model', 'model'],
    ['llamaapi:chat:model', 'model'],
    ['llamaapi:vendor:model:version', 'vendor:model:version'],
    ['llamaapi:chat:vendor:model:version', 'vendor:model:version'],
    ['llamaapi:chatty:model', 'chatty:model'],
    ['llamaapi', ''],
    ['llamaapi:', ''],
    ['llamaapi:chat', ''],
    ['llamaapi:chat:', ''],
    ['llamaapi::model', ':model'],
    ['llamaapi:chat::model:', ':model:'],
    ['', ''],
  ])('should parse provider path %j as model %j', (providerPath, expectedModelName) => {
    const provider = createLlamaApiProvider(providerPath);

    expect(provider).toBeInstanceOf(LlamaApiProvider);
    expect((provider as LlamaApiProvider).modelName).toBe(expectedModelName);
  });

  it('should give factory-level id and env options precedence over nested provider options', () => {
    const nestedEnv: EnvOverrides = { LLAMA_API_KEY: 'nested' };
    const env: EnvOverrides = { LLAMA_API_KEY: 'outer' };
    const options: ProviderOptions = {
      id: 'nested-id',
      env: nestedEnv,
      config: {
        temperature: 0.8,
        max_tokens: 2048,
        passthrough: { custom_param: 'value' },
      },
    };

    const provider = createLlamaApiProvider('llamaapi:vendor:model', {
      config: options,
      id: 'outer-id',
      env,
    }) as LlamaApiProvider;

    expect(provider.id()).toBe('outer-id');
    expect(provider.env).toBe(env);
    expect(provider.config).toMatchObject({
      temperature: 0.8,
      max_tokens: 2048,
      apiBaseUrl: 'https://api.llama.com/compat/v1',
      apiKeyEnvar: 'LLAMA_API_KEY',
      passthrough: { custom_param: 'value' },
    });
  });
});
