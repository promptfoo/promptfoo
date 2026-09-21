import { getEnvString } from '../envars';
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

  const apiBaseUrl =
    configWithoutBasePath.apiBaseUrl ||
    options.config?.env?.ENVOY_API_BASE_URL ||
    options.env?.ENVOY_API_BASE_URL ||
    getEnvString('ENVOY_API_BASE_URL');

  if (!apiBaseUrl) {
    throw new Error(
      'Envoy provider requires a gateway URL. Set ENVOY_API_BASE_URL environment variable or specify apiBaseUrl in config.',
    );
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const normalizedBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

  const envoyConfig = {
    ...options.config,
    id: options.id ?? options.config?.id,
    env: options.config?.env ?? options.env,
    config: {
      ...configWithoutBasePath,
      apiBaseUrl: normalizedBaseUrl,
    },
  };

  return new OpenAiChatCompletionProvider(modelName, envoyConfig);
}
