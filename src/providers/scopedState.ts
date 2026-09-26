import cliState from '../cliState';

/** Keep a provider's clients and response cache owned by their invocation environment. */
export function createEnvironmentScopedState<T>(create: () => T): () => T {
  const scopes = new WeakMap<object, T>();
  const fallback = create();
  return () => {
    const scope = cliState.envScope;
    if (!scope) {
      return fallback;
    }
    let state = scopes.get(scope);
    if (state === undefined) {
      state = create();
      scopes.set(scope, state);
    }
    return state;
  };
}
