import { evaluate as doEvaluate } from './evaluator.js';
import { loadApiProvider } from './providers.js';

import type { ApiProvider, EvaluateOptions, EvaluateSummary } from './types.js';

async function evaluate(
  providers: (string | ApiProvider)[] | (string | ApiProvider),
  options: Omit<EvaluateOptions, 'providers'>,
): Promise<EvaluateSummary> {
  let apiProviders: ApiProvider[] = [];
  const addProvider = async (provider: ApiProvider | string) => {
    if (typeof provider === 'string') {
      apiProviders.push(await loadApiProvider(provider));
    } else {
      apiProviders.push(provider);
    }
  };

  if (Array.isArray(providers)) {
    for (const provider of providers) {
      await addProvider(provider);
    }
  } else {
    await addProvider(providers);
  }

  return doEvaluate({
    ...options,
    providers: apiProviders,
  });
}

module.exports = {
  evaluate,
};

export default {
  evaluate,
};
