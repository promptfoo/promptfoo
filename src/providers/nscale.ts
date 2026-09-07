import { getEnvString } from '../envars';
import { resolveProviderCreatorInput } from './creator';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { ApiProvider } from '../types/index';
import type { ProviderCreatorOptions } from './creator';

/**
 * Creates an Nscale provider using OpenAI-compatible endpoints
 *
 * Nscale provides serverless AI inference with OpenAI-compatible API endpoints.
 * All parameters are automatically passed through to the Nscale API.
 *
 * Documentation: https://docs.nscale.com/
 */
/**
 * Config keys promptfoo consumes itself rather than forwarding to the model.
 *
 * `passthrough` is serialized verbatim into the request body, so anything spread
 * into it is sent to Nscale as a model parameter. Spreading the whole user config
 * put `apiKey` — the raw service token — into the JSON body, and diverted
 * `headers` there too so custom headers never became HTTP headers.
 *
 * Mirrors `OpenAiSharedOptions` in `./openai/types`.
 */
const NSCALE_PROVIDER_LEVEL_OPTIONS = new Set([
  'apiKey',
  'apiKeyEnvar',
  'apiKeyRequired',
  'apiHost',
  'apiBaseUrl',
  'organization',
  'headers',
  'maxRetries',
  'cost',
  'inputCost',
  'outputCost',
  'audioCost',
  'audioInputCost',
  'audioOutputCost',
  'mcp',
  'functionToolCallbacks',
  'showThinking',
  'omitDefaults',
  'basePath',
  'linkedTargetId',
]);

export function createNscaleProvider(
  providerPath: string,
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const { providerOptions, parsedPath } = resolveProviderCreatorInput(providerPath, options);
  const splits = parsedPath.segments;

  const config = providerOptions.config || {};

  // Split the user's config into settings promptfoo handles (auth, routing,
  // headers, cost overrides) and genuine model parameters, so only the latter
  // reach the request body.
  const { passthrough: explicitPassthrough, ...configOptions } = config;
  const providerLevelOptions: Record<string, any> = {};
  const modelParameters: Record<string, any> = {};
  for (const [key, value] of Object.entries(configOptions)) {
    if (NSCALE_PROVIDER_LEVEL_OPTIONS.has(key)) {
      providerLevelOptions[key] = value;
    } else {
      modelParameters[key] = value;
    }
  }

  // Prefer service tokens over API keys (API keys deprecated Oct 30, 2025)
  const getApiKey = () => {
    return (
      config.apiKey ||
      providerOptions.env?.NSCALE_SERVICE_TOKEN ||
      getEnvString('NSCALE_SERVICE_TOKEN') ||
      providerOptions.env?.NSCALE_API_KEY ||
      getEnvString('NSCALE_API_KEY')
    );
  };

  const nscaleConfig = {
    ...providerOptions,
    config: {
      ...providerLevelOptions,
      // Honor an explicit apiBaseUrl (private/regional Nscale endpoints) instead
      // of silently ignoring it while still shipping it in the request body.
      apiBaseUrl: providerLevelOptions.apiBaseUrl || 'https://inference.api.nscale.com/v1',
      apiKey: getApiKey(),
      passthrough: {
        ...modelParameters,
        ...explicitPassthrough,
      },
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'image') {
    return createNscaleImageProvider(providerPath, {
      config: providerOptions.config,
      id: providerOptions.id,
      env: providerOptions.env,
    });
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, nscaleConfig);
  }
}
