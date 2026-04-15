import type { ProviderFactory } from '../../providers/registryTypes';

export const redteamProviderFactories: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath === 'agentic:memory-poisoning',
    create: async (_providerPath, providerOptions) => {
      const { MemoryPoisoningProvider } = await import('./agentic/memoryPoisoning');
      return new MemoryPoisoningProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:best-of-n',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamBestOfNProvider } = await import('./bestOfN');
      return new RedteamBestOfNProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:crescendo',
    create: async (_providerPath, providerOptions) => {
      const { CrescendoProvider } = await import('./crescendo/index');
      return new CrescendoProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath === 'promptfoo:redteam:custom' ||
      providerPath.startsWith('promptfoo:redteam:custom:'),
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamCustomProvider } = await import('./custom/index');
      return new RedteamCustomProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:goat',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamGoatProvider } = await import('./goat');
      return new RedteamGoatProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath === 'promptfoo:redteam:authoritative-markup-injection',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamAuthoritativeMarkupInjectionProvider } = await import(
        './authoritativeMarkupInjection'
      );
      return new RedteamAuthoritativeMarkupInjectionProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:mischievous-user',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamMischievousUserProvider } = await import('./mischievousUser');
      return new RedteamMischievousUserProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamIterativeProvider } = await import('./iterative');
      return new RedteamIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:image',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamImageIterativeProvider } = await import('./iterativeImage');
      return new RedteamImageIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:tree',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamIterativeTreeProvider } = await import('./iterativeTree');
      return new RedteamIterativeTreeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:meta',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamIterativeMetaProvider } = await import('./iterativeMeta');
      return new RedteamIterativeMetaProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:hydra',
    create: async (_providerPath, providerOptions) => {
      const { HydraProvider } = await import('./hydra/index');
      return new HydraProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:indirect-web-pwn',
    create: async (_providerPath, providerOptions) => {
      const { default: RedteamIndirectWebPwnProvider } = await import('./indirectWebPwn');
      return new RedteamIndirectWebPwnProvider(providerOptions.config);
    },
  },
];
