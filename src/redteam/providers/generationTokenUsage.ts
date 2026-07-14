import { BaseTokenUsageSchema } from '../../types/shared';
import { accumulateResponseTokenUsage, getErrorTokenUsage } from '../../util/tokenUsageUtils';

import type { ApiProvider } from '../../types/index';
import type { TokenUsage } from '../../types/shared';

export function trackGenerationTokenUsage(
  provider: ApiProvider,
  tokenUsage: TokenUsage,
): ApiProvider {
  const callApi = provider.callApi.bind(provider);
  const trackedCallApi: ApiProvider['callApi'] = async (...args) => {
    try {
      const response = await callApi(...args);
      let responseTokenUsage: TokenUsage | undefined;
      try {
        const parsedTokenUsage = BaseTokenUsageSchema.safeParse(response.tokenUsage);
        responseTokenUsage = parsedTokenUsage.success ? parsedTokenUsage.data : undefined;
      } catch {
        responseTokenUsage = undefined;
      }
      accumulateResponseTokenUsage(
        tokenUsage,
        { tokenUsage: responseTokenUsage },
        { countAsRequest: false },
      );
      if (!response.cached) {
        const reportedRequests = responseTokenUsage?.numRequests ?? 0;
        tokenUsage.numRequests = (tokenUsage.numRequests ?? 0) + Math.max(1, reportedRequests);
      }
      return response;
    } catch (error) {
      const errorTokenUsage = getErrorTokenUsage(error);
      accumulateResponseTokenUsage(
        tokenUsage,
        { tokenUsage: errorTokenUsage },
        { countAsRequest: false },
      );
      tokenUsage.numRequests =
        (tokenUsage.numRequests ?? 0) + Math.max(1, errorTokenUsage?.numRequests ?? 0);
      throw error;
    }
  };
  trackedCallApi.label = provider.callApi.label;

  const trackedProvider = Object.create(provider) as ApiProvider;
  Object.defineProperty(trackedProvider, 'callApi', {
    configurable: true,
    value: trackedCallApi,
    writable: true,
  });

  return new Proxy(trackedProvider, {
    get(_target, property) {
      if (property === 'callApi') {
        return trackedCallApi;
      }

      const value = Reflect.get(provider, property, provider);
      return typeof value === 'function' ? value.bind(provider) : value;
    },
  });
}
