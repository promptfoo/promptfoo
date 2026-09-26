import cliState from '../cliState';
import { providerRegistry } from './providerRegistry';

/** Keep a provider's clients and response cache owned by their invocation environment. */
export function createEnvironmentScopedState<T>(
  create: () => T,
  cleanup?: (state: T) => void | Promise<void>,
): () => T {
  const scopes = new WeakMap<object, T>();
  const fallbackScope = {};
  let fallback: T | undefined;
  return () => {
    const scope = cliState.envScope;
    let state = scope ? scopes.get(scope) : fallback;
    if (state === undefined) {
      state = create();
      if (scope) {
        scopes.set(scope, state);
      } else {
        fallback = state;
      }
      if (cleanup) {
        const owned = state;
        providerRegistry.register(
          {
            async shutdown() {
              // New calls must not reuse a client whose shutdown has started.
              if (scope) {
                scopes.delete(scope);
              } else {
                fallback = undefined;
              }
              await cleanup(owned);
            },
          },
          scope ?? fallbackScope,
        );
      }
    }
    return state;
  };
}
