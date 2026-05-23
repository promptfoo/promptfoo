import { DeepSeekProvider } from '../deepseek';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

// Default model for DeepSeek grading - deepseek-chat is the most capable general model
// Cost-effective with prompt caching support
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

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
