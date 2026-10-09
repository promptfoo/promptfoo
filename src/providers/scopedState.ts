import cliState from '../cliState';
import { providerRegistry } from './providerRegistry';

/** Keep clients and response caches within both their environment and resource lifetime. */
export function createEnvironmentScopedState<T>(
  create: () => T,
  cleanup?: (state: T) => void | Promise<void>,
): (() => T) & { reset: () => void } {
  const lifetimes = new WeakMap<object, WeakMap<object, T>>();
  const fallbackScope = {};
  const getState = () => {
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
      // Standalone callers retain the provider-owned lifetime they had before
      // scoped cleanup. A global registration would keep them alive indefinitely.
      if (cleanup && providerRegistry.currentScope) {
        const owned = state;
        providerRegistry.register(
          {
            async shutdown() {
              // New calls must not reuse a client whose shutdown has started.
              if (states.get(scope) === owned) {
                states.delete(scope);
              }
              await cleanup(owned);
            },
          },
          lifetime,
          false,
        );
      }
    }
    return state;
  };
  return Object.assign(getState, {
    reset() {
      const scope = cliState.envScope ?? fallbackScope;
      const lifetime = providerRegistry.currentScope ?? scope;
      // Retired clients retain cleanup ownership until the resource lifetime ends.
      lifetimes.get(lifetime)?.delete(scope);
    },
  });
}

/** Release a completed SDK client without waiting for abandoned construction. */
export function destroyScopedClient<T extends { destroy(): void }>(
  client: T | undefined,
  initialization: Promise<T> | undefined,
  onError: (error: unknown) => void,
): void {
  if (client) {
    client.destroy();
    return;
  }
  // Evaluation timeouts must still return when initialization never settles.
  // Retain cleanup ownership if the abandoned operation eventually succeeds.
  void initialization
    ?.then(
      (initialized) => initialized.destroy(),
      () => undefined,
    )
    .catch(onError);
}
