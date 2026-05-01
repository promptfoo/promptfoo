import { createXAIProvider } from './chat';
import { XAIEmbeddingProvider } from './embedding';
import { XAIResponsesProvider } from './responses';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

const DEFAULT_XAI_MODEL = 'grok-4.3';

export function getXAIProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'embeddingProvider'
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
  | 'webSearchProvider'
> {
  const gradingProvider = createXAIProvider(`xai:${DEFAULT_XAI_MODEL}`, { env });

  return {
    embeddingProvider: new XAIEmbeddingProvider('v1', { env }),
    gradingJsonProvider: createXAIProvider(`xai:${DEFAULT_XAI_MODEL}`, {
      env,
      config: {
        config: {
          response_format: { type: 'json_object' },
        },
      },
    }),
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
