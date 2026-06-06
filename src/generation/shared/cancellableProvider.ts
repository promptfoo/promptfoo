import type { ApiProvider } from '../../types/providers';

/** Attach a request-scoped abort signal to every provider call in a generation job. */
export function withAbortSignal(
  provider: ApiProvider,
  abortSignal: AbortSignal | undefined,
): ApiProvider {
  if (!abortSignal) {
    return provider;
  }

  return new Proxy(provider, {
    get(target, property, receiver) {
      if (property === 'callApi') {
        return async (
          prompt: string,
          context?: Parameters<ApiProvider['callApi']>[1],
          options = {},
        ) => {
          abortSignal.throwIfAborted();
          return target.callApi(prompt, context, { ...options, abortSignal });
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
