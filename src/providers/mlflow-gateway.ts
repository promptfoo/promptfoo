import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * MLflow AI Gateway configuration options
 *
 * MLflow AI Gateway (MLflow >= 3.0) is a database-backed LLM proxy that
 * routes requests to multiple providers through a unified OpenAI-compatible
 * endpoint. Provider API keys are stored encrypted on the server.
 *
 * @see https://mlflow.org/docs/latest/genai/governance/ai-gateway/
 */
export interface MlflowGatewayCompletionOptions extends OpenAiCompletionOptions {
  /**
   * The MLflow Gateway server URL (e.g., http://localhost:5000)
   * Can be set via MLFLOW_GATEWAY_URL environment variable
   */
  gatewayUrl?: string;
}

export type MlflowGatewayProviderOptions = ProviderOptions & {
  config: MlflowGatewayCompletionOptions;
};

/**
 * MLflow AI Gateway provider
 *
 * Routes requests through MLflow AI Gateway's OpenAI-compatible endpoint.
 * The model name corresponds to the gateway endpoint name configured in the
 * MLflow UI.
 *
 * Usage: mlflow-gateway:my-endpoint-name
 *
 * @see https://mlflow.org/docs/latest/genai/governance/ai-gateway/endpoints/query-endpoints/
 */
export class MlflowGatewayChatCompletionProvider extends OpenAiChatCompletionProvider {
  config: MlflowGatewayCompletionOptions;

  constructor(modelName: string, providerOptions: MlflowGatewayProviderOptions) {
    const gatewayUrl = providerOptions.config?.gatewayUrl || getEnvString('MLFLOW_GATEWAY_URL');

    if (!gatewayUrl) {
      throw new Error(
        'MLflow Gateway URL is required. Set it in the provider config or via the ' +
          'MLFLOW_GATEWAY_URL environment variable (e.g., http://localhost:5000).',
      );
    }

    const cleanGatewayUrl = gatewayUrl.replace(/\/$/, '');
    const apiBaseUrl = `${cleanGatewayUrl}/gateway/openai/v1`;

    const mergedConfig: MlflowGatewayCompletionOptions = {
      ...providerOptions.config,
      // Default to a placeholder key since the gateway manages provider keys
      apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'MLFLOW_GATEWAY_API_KEY',
      apiBaseUrl,
    };

    super(modelName, {
      ...providerOptions,
      config: mergedConfig,
    });

    this.config = mergedConfig;
  }
}
