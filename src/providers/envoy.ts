import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';

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
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  if (!modelName) {
    throw new Error('Envoy provider requires a model name. Use format: envoy:<model_name>');
  }

  // Filter out basePath from config to avoid passing it to the API
  const { basePath: _, ...configWithoutBasePath } = options.config?.config || {};

  // Get the gateway URL from config or environment
  const apiBaseUrl = configWithoutBasePath.apiBaseUrl || process.env.ENVOY_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error(
      'Envoy provider requires a gateway URL. Set ENVOY_API_BASE_URL environment variable or specify apiBaseUrl in config.',
    );
  }

  // Ensure the URL ends with the correct path if not already specified
  const normalizedBaseUrl = apiBaseUrl.endsWith('/v1')
    ? apiBaseUrl
    : `${apiBaseUrl.replace(/\/$/, '')}/v1`;

  const envoyConfig = {
    ...options,
    config: {
      apiBaseUrl: normalizedBaseUrl,
      // Authentication is optional and depends on gateway configuration
      // Users can specify apiKey, headers, or other auth in their config
      ...configWithoutBasePath,
    },
  };

  return new OpenAiChatCompletionProvider(modelName, envoyConfig);
}
