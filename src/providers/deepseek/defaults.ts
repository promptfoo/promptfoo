import { DeepSeekProvider } from '../deepseek';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

// Default model for DeepSeek grading: current primary, cost-effective chat model
// with prompt caching support.
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

export function getDeepSeekProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  'gradingJsonProvider' | 'gradingProvider' | 'suggestionsProvider' | 'synthesizeProvider'
> {
  const gradingProvider = new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL, { env });

  return {
    gradingProvider,
    gradingJsonProvider: new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL, {
      env,
      config: {
        response_format: { type: 'json_object' },
      },
    }),
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
}
