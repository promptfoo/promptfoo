import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
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
    if (!modelName || modelName.trim() === '') {
      throw new Error(
        'MLflow Gateway endpoint name is required. Use the format ' +
          '"mlflow-gateway:<endpoint-name>" where <endpoint-name> is the name of ' +
          'the gateway endpoint you created in the MLflow UI.',
      );
    }

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
      apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'MLFLOW_GATEWAY_API_KEY',
      apiBaseUrl,
      apiKeyRequired: providerOptions.config?.apiKeyRequired ?? false,
    };

    super(modelName, {
      ...providerOptions,
      id: providerOptions.id || `mlflow-gateway:${modelName}`,
      config: mergedConfig,
    });

    this.config = mergedConfig;
  }

  // Do not fall back to OPENAI_API_KEY: the gateway is a different service, and
  // forwarding a user's cloud OpenAI key to an MLflow proxy URL they control
  // would leak that credential in the Authorization header.
  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar as EnvVarKey | undefined;
    return (
      this.config.apiKey ||
      (envar ? getEnvString(envar) || this.env?.[envar as keyof EnvOverrides] : undefined)
    );
  }

  protected getMissingApiKeyErrorMessage(): string {
    return (
      `MLflow Gateway API key is not set. Set the ${this.config.apiKeyEnvar || 'MLFLOW_GATEWAY_API_KEY'} ` +
      'environment variable or add `apiKey` to the provider config. The gateway does not ' +
      'validate the key; any non-empty value is accepted.'
    );
  }
}
