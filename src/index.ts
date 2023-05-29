import { evaluate as doEvaluate } from './evaluator.js';
import { loadApiProvider } from './providers.js';
import assertions from './assertions.js';
import providers from './providers.js';

import type { ApiProvider, EvaluateOptions, EvaluateSummary, TestSuite } from './types.js';

export * from './types.js';

async function evaluate() {}
/*
async function evaluate(
  // providers: (string | ApiProvider)[] | (string | ApiProvider),
  testSuite: TestSuite,
  options: EvaluateOptions,
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
 */

module.exports = {
  evaluate,
  assertions,
  providers,
};

export default {
  evaluate,
  assertions,
  providers,
};
