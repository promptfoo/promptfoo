import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

const MLFLOW_GATEWAY_URL_ENV_VAR = 'MLFLOW_GATEWAY_URL';
const MLFLOW_GATEWAY_API_KEY_ENV_VAR = 'MLFLOW_GATEWAY_API_KEY';
const MLFLOW_GATEWAY_API_PATH = '/gateway/mlflow/v1';

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

function normalizeGatewayUrl(gatewayUrl: string | undefined): string | undefined {
  const trimmedGatewayUrl = gatewayUrl?.trim();
  return trimmedGatewayUrl ? trimmedGatewayUrl.replace(/\/+$/, '') : undefined;
}

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

    const gatewayUrl =
      normalizeGatewayUrl(providerOptions.config?.gatewayUrl) ??
      normalizeGatewayUrl(getProviderEnvString(providerOptions.env, MLFLOW_GATEWAY_URL_ENV_VAR)) ??
      normalizeGatewayUrl(getEnvString(MLFLOW_GATEWAY_URL_ENV_VAR));

    if (!gatewayUrl) {
      throw new Error(
        'MLflow Gateway URL is required. Set it in the provider config or via the ' +
          `${MLFLOW_GATEWAY_URL_ENV_VAR} environment variable (e.g., http://localhost:5000).`,
      );
    }

    const apiBaseUrl = `${gatewayUrl}${MLFLOW_GATEWAY_API_PATH}`;

    const mergedConfig: MlflowGatewayCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: providerOptions.config?.apiKeyEnvar || MLFLOW_GATEWAY_API_KEY_ENV_VAR,
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
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }
    if (!envar) {
      return undefined;
    }

    return getProviderEnvString(this.env, envar) ?? getEnvString(envar);
  }

  getOrganization(): undefined {
    return undefined;
  }

  // Do not fall back to OPENAI_API_HOST / OPENAI_API_BASE_URL / OPENAI_BASE_URL:
  // these are configured for cloud OpenAI, not the MLflow gateway. If the user
  // has any of those set for other providers, inheriting OpenAiGenericProvider's
  // getApiUrl() would silently route mlflow-gateway:* requests to the wrong URL.
  getApiUrl(): string {
    return this.config.apiBaseUrl || this.getApiUrlDefault();
  }

  protected getMissingApiKeyErrorMessage(): string {
    return (
      `MLflow Gateway Bearer token is not set. Set the ${this.config.apiKeyEnvar || MLFLOW_GATEWAY_API_KEY_ENV_VAR} ` +
      'environment variable or add `apiKey` to the provider config.'
    );
  }
}
