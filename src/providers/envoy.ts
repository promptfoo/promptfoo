import { getEnvString } from '../envars';
import { resolveProviderCreatorInput } from './creator';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ApiProvider } from '../types/index';
import type { ProviderCreatorOptions } from './creator';

/**
 * Creates an Envoy AI Gateway provider using OpenAI-compatible endpoints
 *
 * Documentation: https://aigateway.envoyproxy.io/docs/getting-started/basic-usage
 *
 * The Envoy AI Gateway provides OpenAI-compatible endpoints:
 * - /v1/chat/completions for chat
 * - /v1/embeddings for embeddings
 *
 * Example configurations:
 * ```yaml
 * providers:
 *   - id: envoy:my-model
 *     config:
 *       apiBaseUrl: "https://your-envoy-gateway.com/v1"
 *       # Authentication is optional and depends on your gateway setup:
 *       apiKey: "your-api-key"  # if using API key auth
 *       # headers:               # if using custom headers
 *       #   Authorization: "Bearer token"
 *       #   X-Custom-Auth: "value"
 * ```
 */
export function createEnvoyProvider(
  providerPath: string,
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  if (!modelName) {
    throw new Error('Envoy provider requires a model name. Use format: envoy:<model_name>');
  }

  // Filter out basePath from config to avoid passing it to the API
  const { basePath: _, ...configWithoutBasePath } = providerOptions.config || {};

  const apiBaseUrl =
    configWithoutBasePath.apiBaseUrl ||
    providerOptions.env?.ENVOY_API_BASE_URL ||
    getEnvString('ENVOY_API_BASE_URL');

  if (!apiBaseUrl) {
    throw new Error(
      'Envoy provider requires a gateway URL. Set ENVOY_API_BASE_URL environment variable or specify apiBaseUrl in config.',
    );
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const normalizedBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

  const envoyConfig = {
    ...providerOptions,
    config: {
      ...configWithoutBasePath,
      apiBaseUrl: normalizedBaseUrl,
    },
  };

  return new OpenAiChatCompletionProvider(modelName, envoyConfig);
}
