import cliState from '../cliState';
import { providerRegistry } from './providerRegistry';

interface StateEntry<T> {
  value: T;
  resource?: { shutdown(): Promise<void> };
}

/** Keep clients and response caches within both their environment and resource lifetime. */
export function createEnvironmentScopedState<T>(
  create: () => T,
  cleanup?: (state: T) => void | Promise<void>,
): (() => T) & { reset: () => void } {
  const lifetimes = new WeakMap<object, WeakMap<object, StateEntry<T>>>();
  const fallbackScope = {};
  const getState = () => {
    providerRegistry.throwIfResourceUseAborted();
    const scope = cliState.envScope ?? fallbackScope;
    const lifetime = providerRegistry.currentScope ?? scope;
    let states = lifetimes.get(lifetime);
    if (!states) {
      states = new WeakMap<object, StateEntry<T>>();
      lifetimes.set(lifetime, states);
    }
    let entry = states.get(scope);
    if (!entry) {
      entry = { value: create() };
      states.set(scope, entry);
      // Standalone callers retain the provider-owned lifetime they had before
      // scoped cleanup. A global registration would keep them alive indefinitely.
      if (cleanup && providerRegistry.currentScope) {
        const owned = entry;
        entry.resource = {
          async shutdown() {
            // Remove the exact entry before asynchronous cleanup starts. A later
            // lookup can create a new state without reusing a closing client.
            if (states.get(scope) === owned) {
              states.delete(scope);
            }
            await cleanup(owned.value);
          },
        };
      }
    }
    if (entry.resource) {
      // Setup hooks can initialize this state before any provider call owns it.
      // Re-register the same resource to claim it for each actual caller.
      providerRegistry.register(entry.resource);
    }
    return entry.value;
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
