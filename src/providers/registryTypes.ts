import type { LoadApiProviderContext } from '../types/index';
import type { ApiProvider, ProviderOptions } from '../types/providers';

/**
 * A single entry in the provider registry. `test` is the authoritative
 * dispatcher: loadApiProvider iterates factories in order and invokes `create`
 * on the first one whose `test` returns true. `create` may only assume its
 * own `test` matched and should not be called otherwise.
 */
export interface ProviderFactory {
  test: (providerPath: string) => boolean;
  create: (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => Promise<ApiProvider>;
}

/**
 * A lazy-loaded group of provider factories. `canHandle` is a **load gate**,
 * not a dispatcher: if it returns true the family's `factories()` promise is
 * awaited and its factories are appended to the registry for this lookup.
 * Dispatch itself still happens through each factory's `test`. `canHandle` and
 * inner `test` predicates are intentionally duplicated so `canHandle` can stay
 * cheap (a string prefix check) while `test` can be as detailed as the
 * individual factory requires.
 */
export interface ProviderFamily {
  canHandle: (providerPath: string) => boolean;
  factories: () => Promise<ProviderFactory[]>;
}
