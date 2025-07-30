import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * Databricks Foundation Model API configuration options
 *
 * Supports both pay-per-token endpoints (e.g., databricks-meta-llama-3-3-70b-instruct)
 * and custom provisioned throughput endpoints deployed via Unity Catalog
 */
export interface DatabricksMosaicAiCompletionOptions extends OpenAiCompletionOptions {
  /**
   * The Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com)
   * Can be set via DATABRICKS_WORKSPACE_URL environment variable
   */
  workspaceUrl?: string;

  /**
   * Whether this is a pay-per-token endpoint (true) or custom deployed endpoint (false)
   * Defaults to false for backward compatibility
   */
  isPayPerToken?: boolean;

  /**
   * Optional usage context for tracking and monitoring
   * @see https://docs.databricks.com/en/ai-gateway/configure-ai-gateway-endpoints.html#usage-context
   */
  usageContext?: Record<string, string>;

  /**
   * Enable AI Gateway features like guardrails, PII detection, etc.
   * Only available on endpoints with AI Gateway enabled
   */
  aiGatewayConfig?: {
    enableSafety?: boolean;
    piiHandling?: 'none' | 'block' | 'mask';
  };
}

export type DatabricksMosaicAiProviderOptions = ProviderOptions & {
  config: DatabricksMosaicAiCompletionOptions;
};

/**
 * Databricks Foundation Model APIs provider
 *
 * Supports:
 * - Pay-per-token endpoints (e.g., databricks-meta-llama-3-3-70b-instruct)
 * - Provisioned throughput endpoints (custom deployed models)
 * - External model endpoints (proxies to OpenAI, Anthropic, etc.)
 *
 * @see https://docs.databricks.com/en/machine-learning/foundation-models/index.html
 */
export class DatabricksMosaicAiChatCompletionProvider extends OpenAiChatCompletionProvider {
  config: DatabricksMosaicAiCompletionOptions;

  constructor(modelName: string, providerOptions: DatabricksMosaicAiProviderOptions) {
    const workspaceUrl =
      providerOptions.config?.workspaceUrl || getEnvString('DATABRICKS_WORKSPACE_URL');

    if (!workspaceUrl) {
      throw new Error(
        'Databricks workspace URL is required. Set it in the config or DATABRICKS_WORKSPACE_URL environment variable.',
      );
    }

    // Ensure workspace URL doesn't have trailing slash
    const cleanWorkspaceUrl = workspaceUrl.replace(/\/$/, '');

    // For pay-per-token endpoints, the model name is the full endpoint name
    // For custom endpoints, we use the serving-endpoints path
    const apiBaseUrl = providerOptions.config?.isPayPerToken
      ? cleanWorkspaceUrl
      : `${cleanWorkspaceUrl}/serving-endpoints`;

    const mergedConfig: DatabricksMosaicAiCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'DATABRICKS_TOKEN',
      apiBaseUrl,
      // Pass through usage context and AI Gateway config as extra body params
      ...(providerOptions.config?.usageContext && {
        extraBodyParams: {
          ...providerOptions.config.extraBodyParams,
          usage_context: providerOptions.config.usageContext,
        },
      }),
    };

    super(modelName, {
      ...providerOptions,
      config: mergedConfig,
    });

    // Set the config property with the full Databricks-specific configuration
    this.config = mergedConfig;
  }

  /**
   * Override getApiUrl to handle Databricks-specific endpoint patterns
   */
  public getApiUrl(): string {
    // For pay-per-token endpoints, use the model name directly in the path
    if (this.config.isPayPerToken) {
      return `${this.config.apiBaseUrl}/serving-endpoints/${this.modelName}/invocations`;
    }
    // For custom endpoints, use standard OpenAI chat completions path
    return super.getApiUrl();
  }
}
