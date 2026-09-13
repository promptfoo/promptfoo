import type { ApiProvider } from '../../types/providers';
import type { ProviderCreatorOptions } from '../creator';
import type { ProviderFactory } from '../registryTypes';

type Creator = (path: string, options: ProviderCreatorOptions) => ApiProvider;

// A family lookup loads this small table; only the selected creator loads its implementation.
const creators: readonly (readonly [string, () => Promise<Creator>])[] = [
  ['cerebras', async () => (await import('../cerebras')).createCerebrasProvider],
  ['envoy', async () => (await import('../envoy')).createEnvoyProvider],
  ['litellm', async () => (await import('../litellm')).createLiteLLMProvider],
  ['novita', async () => (await import('../novita')).createNovitaProvider],
  ['nscale', async () => (await import('../nscale')).createNscaleProvider],
  ['togetherai', async () => (await import('../togetherai')).createTogetherAiProvider],
];

export const compatibleProviderFactories: ProviderFactory[] = creators.map(([prefix, load]) => ({
  test: (path) => path.startsWith(`${prefix}:`),
  create: async (path, providerOptions) => {
    const create = await load();
    return create(path, { providerOptions });
  },
}));
