import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import {
  getAndCheckProvider,
  getGradingProvider,
  getRemoteGradingContext,
} from '../../src/matchers/providers';
import { renderLlmRubricPrompt } from '../../src/matchers/rubric';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
} from '../../src/providers/openai/defaults';
import { createMockProvider } from '../factories/provider';
import { mockProcessEnv } from '../util/utils';

import type { ProviderTypeMap } from '../../src/types/index';

describe('getRemoteGradingContext', () => {
  beforeEach(() => {
    cliState.config = undefined;
    cliState.selectedProviderConfigs = undefined;
  });

  afterEach(() => {
    cliState.config = undefined;
    cliState.selectedProviderConfigs = undefined;
  });

  it('prefers the actively selected provider configs', () => {
    cliState.config = { providers: ['promptfoo://provider/excluded-target'] };
    cliState.selectedProviderConfigs = ['promptfoo://provider/selected-target'];

    expect(getRemoteGradingContext()).toEqual({ targetId: 'selected-target' });
  });

  it('falls back to the configured providers', () => {
    cliState.config = { providers: ['promptfoo://provider/configured-target'] };

    expect(getRemoteGradingContext()).toEqual({ targetId: 'configured-target' });
  });

  it('does not fall back to configured providers when the filter matched nothing', () => {
    cliState.config = { providers: ['promptfoo://provider/configured-target'] };
    cliState.selectedProviderConfigs = [];

    expect(getRemoteGradingContext()).toEqual({});
  });
});

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'text',
      'openai:chat:gpt-4o-mini-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider?.id()).toBe('openai:gpt-4o-mini-foobar');
  });

  it('should return the correct provider when provider is an ApiProvider', async () => {
    const provider = await getGradingProvider(
      'embedding',
      DefaultEmbeddingProvider,
      DefaultGradingProvider,
    );
    expect(provider).toBe(DefaultEmbeddingProvider);
  });

  it('should return the correct provider when provider is ProviderOptions', async () => {
    const providerOptions = {
      id: 'openai:chat:gpt-4o-mini-foobar',
      config: {
        apiKey: 'abc123',
        temperature: 3.1415926,
      },
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:gpt-4o-mini-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});

describe('getAndCheckProvider', () => {
  it('should return the default provider when provider is not defined', async () => {
    await expect(
      getAndCheckProvider('text', undefined, DefaultGradingProvider, 'test check'),
    ).resolves.toBe(DefaultGradingProvider);
  });

  it('should throw when explicitly configured provider does not support type', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
    };
    await expect(
      getAndCheckProvider('embedding', provider, DefaultEmbeddingProvider, 'test check'),
    ).rejects.toThrow('is not a valid embedding provider');
  });

  it('should return the provider if it implements the required method', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
      callEmbeddingApi: () => Promise.resolve({ embedding: [] }),
    };
    const result = await getAndCheckProvider(
      'embedding',
      provider,
      DefaultEmbeddingProvider,
      'test check',
    );
    expect(result).toBe(provider);
  });

  it('should return the default provider when no provider is specified', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });

  it('should return a specific provider when a provider id is specified', async () => {
    const provider = await getGradingProvider('text', 'openai:chat:foo', DefaultGradingProvider);
    // loadApiProvider removes `chat` from the id
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should return a provider from ApiProvider when specified', async () => {
    const providerOptions = createMockProvider({ id: 'custom-provider', response: {} });
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('custom-provider');
  });

  it('should return a provider from ProviderTypeMap when specified', async () => {
    const providerTypeMap: ProviderTypeMap = {
      text: {
        id: 'openai:chat:foo',
      },
      embedding: {
        id: 'openai:embedding:bar',
      },
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:foo');
  });

  it('should return a provider from ProviderTypeMap with basic strings', async () => {
    const providerTypeMap: ProviderTypeMap = {
      text: 'openai:chat:foo',
      embedding: 'openai:embedding:bar',
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should throw an error when the provider does not match the type', async () => {
    const providerTypeMap: ProviderTypeMap = {
      embedding: {
        id: 'openai:embedding:foo',
      },
    };
    await expect(
      getGradingProvider('text', providerTypeMap, DefaultGradingProvider),
    ).rejects.toThrow(
      new Error(
        `Invalid provider definition for output type 'text': ${JSON.stringify(
          providerTypeMap,
          null,
          2,
        )}`,
      ),
    );
  });
});

describe('PROMPTFOO_DISABLE_OBJECT_STRINGIFY environment variable', () => {
  afterEach(() => {
    // Clean up environment variable after each test
    mockProcessEnv({ PROMPTFOO_DISABLE_OBJECT_STRINGIFY: undefined });
  });

  describe('Default behavior (PROMPTFOO_DISABLE_OBJECT_STRINGIFY=false)', () => {
    beforeEach(() => {
      mockProcessEnv({ PROMPTFOO_DISABLE_OBJECT_STRINGIFY: 'false' });
    });

    it('should stringify objects to prevent [object Object] issues', async () => {
      const template = 'Product: {{product}}';
      const product = { name: 'Headphones', price: 99.99 };

      const result = await renderLlmRubricPrompt(template, { product });

      expect(result).not.toContain('[object Object]');
      expect(result).toBe(`Product: ${JSON.stringify(product)}`);
    });

    it('should stringify objects in arrays', async () => {
      const template = 'Items: {{items}}';
      const items = [{ name: 'Item 1', price: 10 }, 'string item', { name: 'Item 2', price: 20 }];

      const result = await renderLlmRubricPrompt(template, { items });

      expect(result).not.toContain('[object Object]');
      expect(result).toContain(JSON.stringify(items[0]));
      expect(result).toContain('string item');
      expect(result).toContain(JSON.stringify(items[2]));
    });
  });

  describe('Object access enabled (PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true)', () => {
    beforeEach(() => {
      mockProcessEnv({ PROMPTFOO_DISABLE_OBJECT_STRINGIFY: 'true' });
    });

    it('should allow direct object property access', async () => {
      const template = 'Product: {{product.name}} - ${{product.price}}';
      const product = { name: 'Headphones', price: 99.99 };

      const result = await renderLlmRubricPrompt(template, { product });

      expect(result).toBe('Product: Headphones - $99.99');
    });

    it('should allow array indexing and property access', async () => {
      const template = 'First item: {{items[0].name}}';
      const items = [
        { name: 'First Item', price: 10 },
        { name: 'Second Item', price: 20 },
      ];

      const result = await renderLlmRubricPrompt(template, { items });

      expect(result).toBe('First item: First Item');
    });
  });
});
