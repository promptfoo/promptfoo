import { evaluate as doEvaluate } from './evaluator.js';
import { loadApiProvider } from './providers.js';

import type { ApiProvider, EvaluateOptions, EvaluateSummary } from './types.js';

async function evaluate(
  provider: string | ApiProvider,
  options: EvaluateOptions,
): Promise<EvaluateSummary> {
  const apiProvider = typeof provider === 'string' ? await loadApiProvider(provider) : provider;
  return doEvaluate(options, apiProvider);
}

export default {
  evaluate,
};
