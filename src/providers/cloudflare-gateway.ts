/**
 * Cloudflare AI Gateway Provider
 *
 * Routes requests to AI providers (OpenAI, Anthropic, etc.) through Cloudflare AI Gateway.
 * Provides caching, rate limiting, analytics, and cost tracking.
 *
 * Gateway URL format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}
 *
 * Usage:
 *   cloudflare-gateway:openai:gpt-4o
 *   cloudflare-gateway:anthropic:claude-sonnet-4-20250514
 *   cloudflare-gateway:groq:llama-3.3-70b-versatile
 *
 * @see https://developers.cloudflare.com/ai-gateway/
 */
import { getEnvString } from '../envars';
import logger from '../logger';
import invariant from '../util/invariant';
import { AnthropicMessagesProvider } from './anthropic/messages';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { AnthropicMessageOptions } from './anthropic/types';
import type { OpenAiCompletionOptions } from './openai/types';

// Cloudflare AI Gateway base URL
const CLOUDFLARE_GATEWAY_BASE_URL = 'https://gateway.ai.cloudflare.com/v1';

/**
 * Configuration for Cloudflare AI Gateway providers
 */
export interface CloudflareGatewayConfig extends OpenAiCompletionOptions {
  /** Cloudflare account ID */
  accountId?: string;
  /** Environment variable name for account ID (default: CLOUDFLARE_ACCOUNT_ID) */
  accountIdEnvar?: string;
  /** AI Gateway ID */
  gatewayId?: string;
  /** Environment variable name for gateway ID (default: CLOUDFLARE_GATEWAY_ID) */
  gatewayIdEnvar?: string;
  /** Optional Cloudflare AI Gateway authentication token for authenticated gateways */
  cfAigToken?: string;
  /** Environment variable name for cf-aig-authorization token (default: CF_AIG_TOKEN) */
  cfAigTokenEnvar?: string;

  // Azure OpenAI specific options
  /** Azure OpenAI resource name (required for azure-openai provider) */
  resourceName?: string;
  /** Azure OpenAI deployment name (required for azure-openai provider) */
  deploymentName?: string;
  /** Azure OpenAI API version (default: 2024-12-01-preview) */
  apiVersion?: string;
}

export interface CloudflareGatewayProviderOptions extends ProviderOptions {
  config?: CloudflareGatewayConfig;
}

/**
 * Provider configuration for routing through Cloudflare AI Gateway
 */
interface GatewayProviderConfig {
  /** Default environment variable for the provider's API key */
  apiKeyEnvar: string;
}

/**
 * Supported provider configurations for Cloudflare AI Gateway
 *
 * Note: Some providers have special URL requirements:
 * - azure-openai: Requires resourceName and deploymentName in config
 * - workers-ai: Model name is appended to URL path
 *
 * AWS Bedrock is NOT supported because it requires AWS request signing
 * which is incompatible with the gateway proxy approach.
 */
const PROVIDER_CONFIGS: Record<string, GatewayProviderConfig> = {
  openai: { apiKeyEnvar: 'OPENAI_API_KEY' },
  anthropic: { apiKeyEnvar: 'ANTHROPIC_API_KEY' },
  groq: { apiKeyEnvar: 'GROQ_API_KEY' },
  'perplexity-ai': { apiKeyEnvar: 'PERPLEXITY_API_KEY' },
  'google-ai-studio': { apiKeyEnvar: 'GOOGLE_API_KEY' },
  mistral: { apiKeyEnvar: 'MISTRAL_API_KEY' },
  cohere: { apiKeyEnvar: 'COHERE_API_KEY' },
  'azure-openai': { apiKeyEnvar: 'AZURE_OPENAI_API_KEY' },
  'workers-ai': { apiKeyEnvar: 'CLOUDFLARE_API_KEY' },
  huggingface: { apiKeyEnvar: 'HUGGINGFACE_API_KEY' },
  replicate: { apiKeyEnvar: 'REPLICATE_API_KEY' },
  grok: { apiKeyEnvar: 'XAI_API_KEY' },
};

/**
 * Get a custom environment variable value safely
 * Uses process.env directly for arbitrary env var names to avoid type casting issues
 */
function getCustomEnvValue(envVarName: string, env?: EnvOverrides): string | undefined {
  // Check env overrides first (for testing), then fall back to process.env
  const envOverrideValue = env?.[envVarName as keyof EnvOverrides];
  if (envOverrideValue) {
    return envOverrideValue as string;
  }
  return process.env[envVarName];
}

/**
 * Get the Cloudflare account ID from config or environment
 */
function getAccountId(config?: CloudflareGatewayConfig, env?: EnvOverrides): string {
  // Check explicit config value first
  if (config?.accountId) {
    return config.accountId;
  }

  // Check custom environment variable if specified
  if (config?.accountIdEnvar) {
    const customValue = getCustomEnvValue(config.accountIdEnvar, env);
    if (customValue) {
      return customValue;
    }
    logger.warn(
      `[CloudflareGateway] Custom account ID environment variable '${config.accountIdEnvar}' is not set. Falling back to CLOUDFLARE_ACCOUNT_ID.`,
    );
  }

  // Fall back to default environment variable
  const accountIdCandidate = env?.CLOUDFLARE_ACCOUNT_ID || getEnvString('CLOUDFLARE_ACCOUNT_ID');

  invariant(
    accountIdCandidate,
    'Cloudflare account ID required. Supply it via config accountId or accountIdEnvar, or the CLOUDFLARE_ACCOUNT_ID environment variable',
  );

  return accountIdCandidate;
}

/**
 * Get the Cloudflare AI Gateway ID from config or environment
 */
function getGatewayId(config?: CloudflareGatewayConfig, env?: EnvOverrides): string {
  // Check explicit config value first
  if (config?.gatewayId) {
    return config.gatewayId;
  }

  // Check custom environment variable if specified
  if (config?.gatewayIdEnvar) {
    const customValue = getCustomEnvValue(config.gatewayIdEnvar, env);
    if (customValue) {
      return customValue;
    }
    logger.warn(
      `[CloudflareGateway] Custom gateway ID environment variable '${config.gatewayIdEnvar}' is not set. Falling back to CLOUDFLARE_GATEWAY_ID.`,
    );
  }

  // Fall back to default environment variable
  const gatewayIdCandidate = env?.CLOUDFLARE_GATEWAY_ID || getEnvString('CLOUDFLARE_GATEWAY_ID');

  invariant(
    gatewayIdCandidate,
    'Cloudflare AI Gateway ID required. Supply it via config gatewayId or gatewayIdEnvar, or the CLOUDFLARE_GATEWAY_ID environment variable',
  );

  return gatewayIdCandidate;
}

/**
 * Get the optional Cloudflare AI Gateway authentication token
 */
function getCfAigToken(config?: CloudflareGatewayConfig, env?: EnvOverrides): string | undefined {
  // Check explicit config value first
  if (config?.cfAigToken) {
    return config.cfAigToken;
  }

  // Check custom environment variable if specified
  if (config?.cfAigTokenEnvar) {
    const customValue = getCustomEnvValue(config.cfAigTokenEnvar, env);
    if (customValue) {
      return customValue;
    }
  }

  // Fall back to default environment variable
  return env?.CF_AIG_TOKEN || getEnvString('CF_AIG_TOKEN');
}

/**
 * Build the Cloudflare AI Gateway URL for a specific provider
 *
 * Most providers use: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}
 * Azure OpenAI uses: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/azure-openai/{resource_name}/{deployment_name}
 * Workers AI uses: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/{model_id}
 */
function buildGatewayUrl(
  accountId: string,
  gatewayId: string,
  provider: string,
  config?: CloudflareGatewayConfig,
  modelName?: string,
): string {
  const baseUrl = `${CLOUDFLARE_GATEWAY_BASE_URL}/${accountId}/${gatewayId}`;

  if (provider === 'azure-openai') {
    const resourceName = config?.resourceName;
    const deploymentName = config?.deploymentName;

    invariant(
      resourceName,
      'Azure OpenAI requires resourceName in config. Example: cloudflare-gateway:azure-openai:gpt-4 with config.resourceName set',
    );
    invariant(
      deploymentName,
      'Azure OpenAI requires deploymentName in config. Example: cloudflare-gateway:azure-openai:gpt-4 with config.deploymentName set',
    );

    return `${baseUrl}/azure-openai/${resourceName}/${deploymentName}`;
  }

  if (provider === 'workers-ai') {
    invariant(modelName, 'Workers AI requires a model name (e.g., @cf/meta/llama-3.1-8b-instruct)');
    return `${baseUrl}/workers-ai/${modelName}`;
  }

  return `${baseUrl}/${provider}`;
}

/**
 * Extract Cloudflare-specific config keys that shouldn't be passed to the underlying provider
 */
function getPassthroughConfig(
  config?: CloudflareGatewayConfig,
): Omit<
  CloudflareGatewayConfig,
  | 'accountId'
  | 'accountIdEnvar'
  | 'gatewayId'
  | 'gatewayIdEnvar'
  | 'cfAigToken'
  | 'cfAigTokenEnvar'
  | 'resourceName'
  | 'deploymentName'
  | 'apiVersion'
> {
  const {
    accountId: _accountId,
    accountIdEnvar: _accountIdEnvar,
    gatewayId: _gatewayId,
    gatewayIdEnvar: _gatewayIdEnvar,
    cfAigToken: _cfAigToken,
    cfAigTokenEnvar: _cfAigTokenEnvar,
    resourceName: _resourceName,
    deploymentName: _deploymentName,
    apiVersion: _apiVersion,
    ...passthrough
  } = config || {};
  return passthrough;
}

/**
 * Cloudflare AI Gateway provider for OpenAI-compatible APIs
 *
 * Routes requests to OpenAI, Groq, Perplexity, Mistral, etc. through Cloudflare AI Gateway
 */
export class CloudflareGatewayOpenAiProvider extends OpenAiChatCompletionProvider {
  private underlyingProvider: string;

  constructor(
    underlyingProvider: string,
    modelName: string,
    providerOptions: CloudflareGatewayProviderOptions,
  ) {
    const accountId = getAccountId(providerOptions.config, providerOptions.env);
    const gatewayId = getGatewayId(providerOptions.config, providerOptions.env);
    const gatewayUrl = buildGatewayUrl(
      accountId,
      gatewayId,
      underlyingProvider,
      providerOptions.config,
      modelName,
    );
    const passthrough = getPassthroughConfig(providerOptions.config);

    const providerConfig = PROVIDER_CONFIGS[underlyingProvider];

    // Build headers, adding cf-aig-authorization if token is provided
    const cfAigToken = getCfAigToken(providerOptions.config, providerOptions.env);
    const headers: Record<string, string> = {
      ...(providerOptions.config?.headers || {}),
    };
    if (cfAigToken) {
      headers['cf-aig-authorization'] = `Bearer ${cfAigToken}`;
    }

    // Build the final API base URL
    let finalGatewayUrl = gatewayUrl;

    // For Azure OpenAI, use api-key header instead of Authorization header
    // Azure doesn't use Bearer auth, so we set the key via header and skip apiKeyEnvar
    let apiKeyEnvar: string | undefined;
    if (underlyingProvider === 'azure-openai') {
      const azureApiKey = providerOptions.config?.apiKey || getEnvString('AZURE_OPENAI_API_KEY');
      invariant(
        azureApiKey,
        'Azure OpenAI API key is required. Set the AZURE_OPENAI_API_KEY environment variable or add apiKey to the provider config.',
      );
      headers['api-key'] = azureApiKey;
      // Don't set apiKeyEnvar - Azure uses api-key header, not Authorization Bearer
      apiKeyEnvar = undefined;

      // Append the api-version query parameter
      const apiVersion = providerOptions.config?.apiVersion || '2024-12-01-preview';
      finalGatewayUrl = `${gatewayUrl}?api-version=${apiVersion}`;
    } else {
      // For non-Azure providers, use standard Bearer auth
      apiKeyEnvar = providerOptions.config?.apiKeyEnvar || providerConfig?.apiKeyEnvar;
    }

    const config: OpenAiCompletionOptions = {
      ...passthrough,
      apiKeyEnvar,
      apiBaseUrl: finalGatewayUrl,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };

    super(modelName, {
      ...providerOptions,
      config,
    });

    this.underlyingProvider = underlyingProvider;

    logger.debug(`[CloudflareGateway] Configured ${underlyingProvider}:${modelName}`, {
      gatewayUrl: finalGatewayUrl,
      hasApiKey: !!providerOptions.config?.apiKey,
      hasCfAigToken: !!cfAigToken,
    });
  }

  id(): string {
    return `cloudflare-gateway:${this.underlyingProvider}:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI Gateway ${this.underlyingProvider} Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'cloudflare-gateway',
      underlyingProvider: this.underlyingProvider,
      model: this.modelName,
      config: {
        ...this.config,
        // Don't expose API keys in JSON output
        apiKey: undefined,
      },
    };
  }
}

/**
 * Extract Anthropic-compatible options from the gateway config
 */
function getAnthropicPassthroughConfig(config?: CloudflareGatewayConfig): AnthropicMessageOptions {
  if (!config) {
    return {};
  }

  const { apiKey, max_tokens, temperature, top_p, cost } = config;
  const top_k = (config as Record<string, unknown>).top_k as number | undefined;

  return {
    ...(apiKey !== undefined && { apiKey }),
    ...(max_tokens !== undefined && { max_tokens }),
    ...(temperature !== undefined && { temperature }),
    ...(top_p !== undefined && { top_p }),
    ...(top_k !== undefined && { top_k }),
    ...(cost !== undefined && { cost }),
  };
}

/**
 * Cloudflare AI Gateway provider for Anthropic
 *
 * Routes requests to Anthropic through Cloudflare AI Gateway
 */
export class CloudflareGatewayAnthropicProvider extends AnthropicMessagesProvider {
  constructor(modelName: string, providerOptions: CloudflareGatewayProviderOptions) {
    const accountId = getAccountId(providerOptions.config, providerOptions.env);
    const gatewayId = getGatewayId(providerOptions.config, providerOptions.env);
    const gatewayUrl = buildGatewayUrl(accountId, gatewayId, 'anthropic');
    const passthrough = getAnthropicPassthroughConfig(providerOptions.config);

    // Build headers, adding cf-aig-authorization if token is provided
    const cfAigToken = getCfAigToken(providerOptions.config, providerOptions.env);
    const headers: Record<string, string> = {
      ...(providerOptions.config?.headers || {}),
    };
    if (cfAigToken) {
      headers['cf-aig-authorization'] = `Bearer ${cfAigToken}`;
    }

    const config: AnthropicMessageOptions = {
      ...passthrough,
      apiBaseUrl: gatewayUrl,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };

    super(modelName, {
      ...providerOptions,
      config,
    });

    logger.debug(`[CloudflareGateway] Configured anthropic:${modelName}`, {
      gatewayUrl,
      hasApiKey: !!providerOptions.config?.apiKey,
      hasCfAigToken: !!cfAigToken,
    });
  }

  id(): string {
    return `cloudflare-gateway:anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI Gateway Anthropic Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'cloudflare-gateway',
      underlyingProvider: 'anthropic',
      model: this.modelName,
      config: {
        ...this.config,
        // Don't expose API keys in JSON output
        apiKey: undefined,
      },
    };
  }
}

/**
 * Create a Cloudflare AI Gateway provider from a provider path
 *
 * @param providerPath - Provider path in format cloudflare-gateway:{provider}:{model}
 * @param options - Provider options including config and environment
 * @returns Configured provider instance
 *
 * @example
 * ```yaml
 * providers:
 *   - id: cloudflare-gateway:openai:gpt-4o
 *     config:
 *       accountId: ${CLOUDFLARE_ACCOUNT_ID}
 *       gatewayId: ${CLOUDFLARE_GATEWAY_ID}
 *       temperature: 0.7
 * ```
 */
export function createCloudflareGatewayProvider(
  providerPath: string,
  options: CloudflareGatewayProviderOptions = {},
): ApiProvider {
  // Parse: cloudflare-gateway:openai:gpt-4o
  const splits = providerPath.split(':');

  if (splits.length < 3) {
    throw new Error(
      `Invalid cloudflare-gateway provider path: "${providerPath}". ` +
        'Expected format: cloudflare-gateway:{provider}:{model} ' +
        '(e.g., cloudflare-gateway:openai:gpt-4o)',
    );
  }

  const underlyingProvider = splits[1];
  const modelName = splits.slice(2).join(':');

  invariant(modelName, 'Model name is required for cloudflare-gateway provider');

  const providerConfig = PROVIDER_CONFIGS[underlyingProvider];
  if (!providerConfig) {
    throw new Error(
      `Unsupported Cloudflare AI Gateway provider: "${underlyingProvider}". ` +
        `Supported providers: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`,
    );
  }

  // Route to appropriate provider class based on API type
  if (underlyingProvider === 'anthropic') {
    return new CloudflareGatewayAnthropicProvider(modelName, options);
  }

  // All other providers use OpenAI-compatible API through the gateway
  return new CloudflareGatewayOpenAiProvider(underlyingProvider, modelName, options);
}
