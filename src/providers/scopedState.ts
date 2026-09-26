import cliState from '../cliState';
import { providerRegistry } from './providerRegistry';

/** Keep clients and response caches within both their environment and resource lifetime. */
export function createEnvironmentScopedState<T>(
  create: () => T,
  cleanup?: (state: T) => void | Promise<void>,
): () => T {
  const lifetimes = new WeakMap<object, WeakMap<object, T>>();
  const fallbackScope = {};
  return () => {
    const scope = cliState.envScope ?? fallbackScope;
    const lifetime = providerRegistry.currentScope ?? scope;
    let states = lifetimes.get(lifetime);
    if (!states) {
      states = new WeakMap<object, T>();
      lifetimes.set(lifetime, states);
    }
    let state = states.get(scope);
    if (state === undefined) {
      state = create();
      states.set(scope, state);
      if (cleanup) {
        const owned = state;
        providerRegistry.register(
          {
            async shutdown() {
              // New calls must not reuse a client whose shutdown has started.
              states.delete(scope);
              await cleanup(owned);
            },
          },
          lifetime,
        );
      }
    }
    return state;
  };
}
