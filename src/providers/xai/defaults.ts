import { createXAIProvider } from './chat';
import { XAIResponsesProvider } from './responses';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

const DEFAULT_XAI_MODEL = 'grok-4.3';

export function getXAIProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
  | 'webSearchProvider'
> {
  const gradingProvider = createXAIProvider(`xai:${DEFAULT_XAI_MODEL}`, { env });

  // The outer `config` is `ProviderOptions.config`; the xAI chat provider then reads
  // its model-specific options from the *nested* `config.config` (see XAIProvider's
  // constructor in ./chat.ts), so the double nesting is intentional.
  const gradingJsonProvider = createXAIProvider(`xai:${DEFAULT_XAI_MODEL}`, {
    env,
    config: {
      config: {
        response_format: { type: 'json_object' },
      },
    },
  });

  return {
    gradingJsonProvider,
    gradingProvider,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
    webSearchProvider: new XAIResponsesProvider(DEFAULT_XAI_MODEL, {
      env,
      config: {
        tools: [{ type: 'web_search' }],
      },
    }),
  };
}
