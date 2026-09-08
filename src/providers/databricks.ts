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
   * Legacy endpoint classification. Both values use the OpenAI-compatible chat endpoint.
   */
  isPayPerToken?: boolean;

  /**
   * Optional usage context for tracking and monitoring
   * @see https://docs.databricks.com/en/ai-gateway/configure-ai-gateway-endpoints.html#usage-context
   */
  usageContext?: Record<string, string>;

  /**
   * @deprecated Configure guardrails on the Databricks serving endpoint.
   * This option does not configure server-side safety or PII handling.
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

    // Databricks accepts both foundation and custom endpoint names in the model field.
    // The inherited chat transport appends /chat/completions to this base URL.
    const apiBaseUrl = `${cleanWorkspaceUrl}/serving-endpoints`;

    const mergedConfig: DatabricksMosaicAiCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'DATABRICKS_TOKEN',
      apiBaseUrl,
      // The shared OpenAI transport sends additional request fields via passthrough.
      ...(providerOptions.config?.usageContext && {
        passthrough: {
          ...providerOptions.config.passthrough,
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
}
