import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveProviderCreatorInput } from '../../src/providers/creator';
import { loadApiProvider } from '../../src/providers/index';
import { createLiteLLMProvider } from '../../src/providers/litellm';
import { createNovitaProvider } from '../../src/providers/novita';
import { createNscaleProvider } from '../../src/providers/nscale';
import { getProviderFactories, providerMap } from '../../src/providers/registry';

import type { EnvOverrides } from '../../src/types/env';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('passes canonical options through without reinterpreting model config', () => {
  const providerOptions = {
    id: 'custom',
    config: { config: { modelOption: true } },
    env: { OPENAI_API_KEY: 'scoped' },
  };
  const input = resolveProviderCreatorInput({
    providerOptions,
    config: { id: 'legacy' },
    env: { OPENAI_API_KEY: 'outer' },
  });
  expect(input).toBe(providerOptions);
});

it('adapts the legacy nested shape with scoped environment precedence', () => {
  expect(
    resolveProviderCreatorInput({
      config: { id: 'nested', config: { temperature: 0 }, env: { OPENAI_API_KEY: 'scoped' } },
      env: { OPENAI_API_KEY: 'suite', LITELLM_API_KEY: 'suite-proxy' },
    }),
  ).toEqual({
    id: 'nested',
    config: { temperature: 0 },
    env: { OPENAI_API_KEY: 'scoped', LITELLM_API_KEY: 'suite-proxy' },
  });
});

const cases = [
  ['cerebras', 'CEREBRAS_API_KEY'],
  ['envoy', 'OPENAI_API_KEY'],
  ['litellm', 'LITELLM_API_KEY'],
  ['novita', 'NOVITA_API_KEY'],
  ['nscale', 'NSCALE_SERVICE_TOKEN'],
  ['togetherai', 'TOGETHER_API_KEY'],
] as const;

describe.each(cases)('%s normalized lazy factory', (prefix, key) => {
  it('preserves a custom ID and provider-scoped credentials through the loader', async () => {
    const provider = await loadApiProvider(`${prefix}:org/model:tag`, {
      env: { [key]: 'suite' } as EnvOverrides,
      options: {
        id: 'custom',
        env: { [key]: 'scoped' } as EnvOverrides,
        config: { apiBaseUrl: 'http://127.0.0.1:1/v1' },
      },
    });
    expect(provider.id()).toBe('custom');
    expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('scoped');
    expect((provider as unknown as { modelName: string }).modelName).toBe('org/model:tag');
    await provider.cleanup?.();
  });

  it('inherits context credentials when called directly', async () => {
    const path = `${prefix}:org/model:tag`;
    const factory = (await getProviderFactories(path)).find((entry) => entry.test(path))!;
    const provider = await factory.create(
      path,
      { id: 'direct', config: { apiBaseUrl: 'http://127.0.0.1:1/v1' } },
      { env: { [key]: 'context-fixture' } as EnvOverrides },
    );
    expect(provider.id()).toBe('direct');
    expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('context-fixture');
    await provider.cleanup?.();
  });

  it('dispatches the selected family before the generic JavaScript-file fallback', async () => {
    const path = `${prefix}:org/model.js`;
    const factories = await getProviderFactories(path);
    const selected = factories.find((factory) => factory.test(path));
    expect(selected).toBeDefined();
    expect(providerMap).not.toContain(selected);
    const provider = await selected!.create(
      path,
      { config: { apiBaseUrl: 'http://127.0.0.1:1/v1' } },
      {},
    );
    expect((provider as unknown as { modelName: string }).modelName).toBe('org/model.js');
    await provider.cleanup?.();
  });
});

it.each(['togetherai', 'litellm', 'nscale', 'novita'])(
  'preserves embedding aliases and colon-containing model names for %s',
  async (prefix) => {
    for (const subtype of ['embedding', 'embeddings']) {
      const provider = await loadApiProvider(`${prefix}:${subtype}:org/model:tag`);
      expect(typeof provider.callEmbeddingApi).toBe('function');
      expect((provider as unknown as { modelName: string }).modelName).toBe('org/model:tag');
      await provider.cleanup?.();
    }
  },
);

it('passes model configuration through the Nscale image delegation once', () => {
  const provider = createNscaleProvider('nscale:image:fixture', {
    providerOptions: { config: { apiKey: 'fixture', size: '1024x1024' } },
  });
  expect(provider.config).toMatchObject({ apiKey: 'fixture', size: '1024x1024' });
  expect(provider.config.config).toBeUndefined();
});

it.each(['chat', 'completion', 'embedding'])(
  'preserves the custom ID on the LiteLLM %s wrapper',
  (type) => {
    const canonical = createLiteLLMProvider(`litellm:${type}:model`, {
      providerOptions: { id: 'canonical-id' },
    });
    const legacy = createLiteLLMProvider(`litellm:${type}:model`, {
      id: 'outer-id',
      config: { id: 'nested-id' },
    });
    expect(canonical.id()).toBe('canonical-id');
    expect(legacy.id()).toBe('nested-id');
  },
);

it.each([
  [{ NOVITA_API_KEY: 'outer-key' }, 'outer-key'],
  [{}, 'process-fixture'],
  [undefined, 'nested-key'],
] as const)('preserves legacy Novita environment selection (%j)', (env, expected) => {
  vi.stubEnv('NOVITA_API_KEY', 'process-fixture');
  const provider = createNovitaProvider('novita:org/model', {
    env,
    config: { env: { NOVITA_API_KEY: 'nested-key' } },
  });
  expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe(expected);
});

it('keeps canonical Novita environment independent of legacy fields', () => {
  const provider = createNovitaProvider('novita:org/model', {
    providerOptions: { env: { NOVITA_API_KEY: 'canonical-key' } },
    env: { NOVITA_API_KEY: 'outer-key' },
    config: { env: { NOVITA_API_KEY: 'nested-key' } },
  });
  expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('canonical-key');
});

it('merges direct Envoy context endpoints with provider-scoped credentials', async () => {
  const path = 'envoy:model';
  const factory = (await getProviderFactories(path)).find((entry) => entry.test(path))!;
  const provider = await factory.create(
    path,
    { env: { OPENAI_API_KEY: 'provider-key' } },
    { env: { ENVOY_API_BASE_URL: 'http://127.0.0.1:1/gateway', OPENAI_API_KEY: 'context-key' } },
  );
  expect(provider.config.apiBaseUrl).toBe('http://127.0.0.1:1/gateway/v1');
  expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('provider-key');
  await provider.cleanup?.();
});

it('keeps higher-priority Nscale aliases when merging direct factory contexts', async () => {
  const path = 'nscale:model';
  const factory = (await getProviderFactories(path)).find((entry) => entry.test(path))!;
  const provider = await factory.create(
    path,
    { env: { NSCALE_API_KEY: 'provider-key' } },
    { env: { NSCALE_SERVICE_TOKEN: 'context-token' } },
  );
  expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('provider-key');
  await provider.cleanup?.();
});

it('ignores undefined legacy env entries while preserving explicit empty masks', () => {
  expect(
    resolveProviderCreatorInput({
      env: { OPENAI_API_KEY: 'suite', LITELLM_API_KEY: 'suite-proxy' },
      config: { env: { OPENAI_API_KEY: undefined, LITELLM_API_KEY: '' } },
    }).env,
  ).toEqual({ OPENAI_API_KEY: 'suite', LITELLM_API_KEY: '' });
});
