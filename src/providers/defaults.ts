import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, DefaultProviders } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ProviderConfiguration } from '../types/providerConfig';
import { AnthropicProviderConfig } from './anthropic/defaults';
import { AzureProviderConfig } from './azure/defaults';
import { BedrockProviderConfig } from './bedrock/defaults';
import { hasGoogleDefaultCredentials } from './google/util';
import { GitHubProviderConfig } from './github/defaults';
import { MistralProviderConfig } from './mistral/defaults';
import { OpenAiProviderConfig } from './openai/defaults';
import { GeminiProviderConfig } from './vertex/defaults';

const COMPLETION_PROVIDERS: (keyof DefaultProviders)[] = [
  'gradingJsonProvider',
  'gradingProvider',
  'llmRubricProvider',
  'suggestionsProvider',
  'synthesizeProvider',
];

const EMBEDDING_PROVIDERS: (keyof DefaultProviders)[] = ['embeddingProvider'];

let defaultCompletionProvider: ApiProvider;
let defaultEmbeddingProvider: ApiProvider;

/**
 * This will override all of the completion type providers defined in the constant COMPLETION_PROVIDERS
 * @param provider - The provider to set as the default completion provider.
 */
export async function setDefaultCompletionProviders(provider: ApiProvider) {
  defaultCompletionProvider = provider;
}

export async function setDefaultEmbeddingProviders(provider: ApiProvider) {
  defaultEmbeddingProvider = provider;
}

/**
 * Helper to check if a key is set in environment or env overrides
 * Exported for testing
 */
export function isKeySet(key: keyof EnvOverrides, env?: EnvOverrides): boolean {
  return !!getEnvString(key) || !!env?.[key];
}

/**
 * Simplified provider configuration with credential checking
 */
interface ProviderEntry {
  /** Provider name for logging */
  name: string;

  /** Provider configuration function */
  config: ProviderConfiguration;

  /** Check if this provider's credentials are available */
  hasCredentials(env?: EnvOverrides): boolean | Promise<boolean>;
}

// Exported for testing
// Order matters - earlier providers take precedence
export const PROVIDERS: ProviderEntry[] = [
  // OpenAI Provider
  {
    name: 'openai',
    config: OpenAiProviderConfig,
    hasCredentials: (env) => isKeySet('OPENAI_API_KEY', env),
  },

  // Azure Provider
  {
    name: 'azure',
    config: AzureProviderConfig,
    hasCredentials: (env) => {
      const hasApiKey = isKeySet('AZURE_OPENAI_API_KEY', env) || isKeySet('AZURE_API_KEY', env);

      const hasClientCreds =
        isKeySet('AZURE_CLIENT_ID', env) &&
        isKeySet('AZURE_CLIENT_SECRET', env) &&
        isKeySet('AZURE_TENANT_ID', env);

      const hasDeploymentName =
        isKeySet('AZURE_DEPLOYMENT_NAME', env) || isKeySet('AZURE_OPENAI_DEPLOYMENT_NAME', env);

      return (hasApiKey || hasClientCreds) && hasDeploymentName;
    },
  },

  // Anthropic Provider
  {
    name: 'anthropic',
    config: AnthropicProviderConfig,
    hasCredentials: (env) => isKeySet('ANTHROPIC_API_KEY', env),
  },

  // AWS Bedrock Provider
  {
    name: 'bedrock',
    config: BedrockProviderConfig,
    hasCredentials: (env) => isKeySet('AWS_BEDROCK_REGION', env),
  },

  // Google Gemini Provider
  {
    name: 'gemini',
    config: GeminiProviderConfig,
    hasCredentials: async () => await hasGoogleDefaultCredentials(),
  },

  // GitHub Models Provider
  {
    name: 'github',
    config: GitHubProviderConfig,
    hasCredentials: (env) => isKeySet('GITHUB_TOKEN', env),
  },

  // Mistral Provider
  {
    name: 'mistral',
    config: MistralProviderConfig,
    hasCredentials: (env) => isKeySet('MISTRAL_API_KEY', env),
  },
];

/**
 * Get default providers based on available credentials
 */
export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  // Check if we have programmatic overrides before even checking for providers
  if (defaultCompletionProvider || defaultEmbeddingProvider) {
    // Start with the default OpenAI providers as a base
    const providers = await OpenAiProviderConfig(env);

    // Apply completion provider overrides if set
    if (defaultCompletionProvider) {
      logger.debug(`Overriding default completion provider: ${defaultCompletionProvider.id()}`);
      COMPLETION_PROVIDERS.forEach((providerKey) => {
        providers[providerKey] = defaultCompletionProvider;
      });
    }

    // Apply embedding provider overrides if set
    if (defaultEmbeddingProvider) {
      logger.debug(`Overriding default embedding provider: ${defaultEmbeddingProvider.id()}`);
      EMBEDDING_PROVIDERS.forEach((providerKey) => {
        providers[providerKey] = defaultEmbeddingProvider;
      });
    }

    return providers;
  }

  // If no programmatic overrides, proceed with normal provider selection
  // Try each provider in priority order
  for (const provider of PROVIDERS) {
    const hasCredentials = await Promise.resolve(provider.hasCredentials(env));

    if (hasCredentials) {
      logger.debug(`Using ${provider.name} default providers`);
      return provider.config(env);
    }
  }

  // Fallback to OpenAI if no credentials are available
  logger.debug('No credentials found, falling back to OpenAI providers');
  return OpenAiProviderConfig(env);
}
