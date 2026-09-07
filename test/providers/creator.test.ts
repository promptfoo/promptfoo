import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseProviderPath, resolveProviderCreatorInput } from '../../src/providers/creator';
import { loadApiProvider } from '../../src/providers/index';
import { createNscaleProvider } from '../../src/providers/nscale';
import { getProviderFactories, providerMap } from '../../src/providers/registry';

import type { EnvOverrides } from '../../src/types/env';

afterEach(() => {
  vi.restoreAllMocks();
});

it('passes canonical options and parsed path through without reinterpreting model config', () => {
  const providerOptions = {
    id: 'custom',
    config: { config: { modelOption: true } },
    env: { OPENAI_API_KEY: 'scoped' },
  };
  const parsedPath = parseProviderPath('togetherai:chat:org:model:tag');
  const input = resolveProviderCreatorInput(parsedPath.value, {
    providerOptions,
    parsedPath,
    config: { id: 'legacy' },
    env: { OPENAI_API_KEY: 'outer' },
  });
  expect(input.providerOptions).toBe(providerOptions);
  expect(input.parsedPath).toBe(parsedPath);
  expect(input.parsedPath.segments).toEqual(['togetherai', 'chat', 'org', 'model', 'tag']);
});

it('adapts the legacy nested shape with scoped environment precedence', () => {
  expect(
    resolveProviderCreatorInput('litellm:model', {
      config: { id: 'nested', config: { temperature: 0 }, env: { OPENAI_API_KEY: 'scoped' } },
      env: { OPENAI_API_KEY: 'suite', LITELLM_API_KEY: 'suite-proxy' },
    }).providerOptions,
  ).toEqual({
    id: 'nested',
    config: { temperature: 0 },
    env: { OPENAI_API_KEY: 'scoped', LITELLM_API_KEY: 'suite-proxy' },
  });
});

it('reparses an unrelated pre-parsed identifier', () => {
  const result = resolveProviderCreatorInput('envoy:new:model', {
    parsedPath: parseProviderPath('envoy:old'),
  });
  expect(result.parsedPath.segments).toEqual(['envoy', 'new', 'model']);
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
