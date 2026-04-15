import type { LoadApiProviderContext } from '../types/index';
import type { ApiProvider, ProviderOptions } from '../types/providers';

export interface ProviderFactory {
  test: (providerPath: string) => boolean;
  create: (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => Promise<ApiProvider>;
}

export interface ProviderFamily {
  canHandle: (providerPath: string) => boolean;
  factories: () => Promise<ProviderFactory[]>;
}
