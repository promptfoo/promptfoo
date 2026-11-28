import { resolveProviderCreatorInput } from './creator';
import { resolveProviderApiKey } from './credentials';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { CHAT_RESOLVED_OPTION_NAMES, splitLocalOptions } from './openai/localOptions';

import type { ApiProvider } from '../types/index';
import type { ProviderCreatorOptions } from './creator';
import type { OpenAiSharedOptions } from './openai/types';

function withNscaleCredentials(
  provider: OpenAiChatCompletionProvider | OpenAiCompletionProvider | OpenAiEmbeddingProvider,
): ApiProvider {
  return Object.assign(provider, {
    getApiKey(config: OpenAiSharedOptions = provider.config): string | undefined {
      return resolveProviderApiKey(config, provider.env, [
        'NSCALE_SERVICE_TOKEN',
        'NSCALE_API_KEY',
      ]);
    },
    getMissingApiKeyErrorMessage(config: OpenAiSharedOptions = provider.config): string {
      return `API key is not set. Set the ${config.apiKeyEnvar || 'NSCALE_SERVICE_TOKEN'} environment variable or add \`apiKey\` to the provider config.`;
    },
  });
}

/**
 * Creates an Nscale provider using OpenAI-compatible endpoints
 *
 * Nscale provides serverless AI inference with OpenAI-compatible API endpoints.
 * All parameters are automatically passed through to the Nscale API.
 *
 * Documentation: https://docs.nscale.com/
 */
export function createNscaleProvider(
  providerPath: string,
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');

  const config = providerOptions.config || {};
  // Options the chat provider resolves itself stay at the top level, where it finds them.
  const getNscaleConfig = (resolvedOptionNames: string[] = []) => {
    const { localOptions, modelParameters } = splitLocalOptions(config, resolvedOptionNames);
    return {
      ...providerOptions,
      config: {
        ...localOptions,
        // Honor an explicit apiBaseUrl (private/regional Nscale endpoints) instead
        // of silently ignoring it while still shipping it in the request body.
        apiBaseUrl: localOptions.apiBaseUrl || 'https://inference.api.nscale.com/v1',
        passthrough: { ...modelParameters, ...config.passthrough },
      },
    };
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(
      new OpenAiChatCompletionProvider(modelName, getNscaleConfig(CHAT_RESOLVED_OPTION_NAMES)),
    );
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(new OpenAiCompletionProvider(modelName, getNscaleConfig()));
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(new OpenAiEmbeddingProvider(modelName, getNscaleConfig()));
  } else if (splits[1] === 'image') {
    return createNscaleImageProvider(providerPath, {
      config,
      id: providerOptions.id,
      env: providerOptions.env,
    });
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return withNscaleCredentials(
      new OpenAiChatCompletionProvider(modelName, getNscaleConfig(CHAT_RESOLVED_OPTION_NAMES)),
    );
  }
}
