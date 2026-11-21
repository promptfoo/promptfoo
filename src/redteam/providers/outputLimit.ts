import { getRedteamProviderMaxTokens } from './constants';

import type { ApiProvider } from '../../types/providers';

/** Share provider state and credentials with generation while budgeting only this call. */
export function withRedteamOutputLimit(provider: ApiProvider): ApiProvider {
  if (!provider.supportsDefaultOutputTokens) {
    return provider;
  }
  const defaultOutputTokens = getRedteamProviderMaxTokens();
  const callApi: ApiProvider['callApi'] = (prompt, context, options) =>
    provider.callApi(prompt, context, { ...options, defaultOutputTokens });
  callApi.label = provider.callApi.label;

  // Keep the original receiver for private fields, lazy authentication and cleanup.
  return new Proxy(provider, {
    get(target, property) {
      if (property === 'callApi') {
        return callApi;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
