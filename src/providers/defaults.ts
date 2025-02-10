import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider } from '../types';
import type { EnvOverrides } from '../types/env';
import {
  DefaultGradingProvider as AnthropicGradingProvider,
  DefaultGradingJsonProvider as AnthropicGradingJsonProvider,
  DefaultSuggestionsProvider as AnthropicSuggestionsProvider,
  DefaultLlmRubricProvider as AnthropicLlmRubricProvider,
} from './anthropic';
import { AzureChatCompletionProvider, AzureEmbeddingProvider } from './azure';
import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
  DefaultModerationProvider as OpenAiModerationProvider,
} from './openai/defaults';
import {
  DefaultGradingProvider as GeminiGradingProvider,
  DefaultEmbeddingProvider as GeminiEmbeddingProvider,
} from './vertex';
import { hasGoogleDefaultCredentials } from './vertexUtil';

interface DefaultProviders {
  datasetGenerationProvider: ApiProvider;
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
}

const COMPLETION_PROVIDERS: (keyof DefaultProviders)[] = [
  'datasetGenerationProvider',
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
 * Overrides the default completion providers with the specified ApiProvider.
 *
 * This will override all of the completion type providers defined in the constant COMPLETION_PROVIDERS.
 *
 * @param provider - The ApiProvider to set as the default for completion roles.
 */
export async function setDefaultCompletionProviders(provider: ApiProvider) {
  defaultCompletionProvider = provider;
}

/**
 * Overrides the default embedding providers with the specified ApiProvider.
 *
 * @param provider - The ApiProvider to set as the default for embedding roles.
 */
export async function setDefaultEmbeddingProviders(provider: ApiProvider) {
  defaultEmbeddingProvider = provider;
}

// New helper functions for provider configuration and creation
/**
 * Checks whether Azure configuration is available.
 *
 * Azure is used if no OpenAI API key is provided and Azure credentials (API key or client credentials)
 * along with required deployment names are available.
 *
 * @param env - Optional overrides for environment variables.
 * @returns True if Azure configuration is detected.
 */
function isAzureConfigured(env?: EnvOverrides): boolean {
  const hasOpenAikey = getEnvString('OPENAI_API_KEY') || env?.OPENAI_API_KEY;
  if (hasOpenAikey) {
    return false;
  }
  const azureApiKey =
    getEnvString('AZURE_OPENAI_API_KEY') ||
    env?.AZURE_OPENAI_API_KEY ||
    getEnvString('AZURE_API_KEY') ||
    env?.AZURE_API_KEY;
  const azureClientCreds =
    (getEnvString('AZURE_CLIENT_ID') || env?.AZURE_CLIENT_ID) &&
    (getEnvString('AZURE_CLIENT_SECRET') || env?.AZURE_CLIENT_SECRET) &&
    (getEnvString('AZURE_TENANT_ID') || env?.AZURE_TENANT_ID);
  const deploymentName = getEnvString('AZURE_DEPLOYMENT_NAME') || env?.AZURE_DEPLOYMENT_NAME;
  const openaiDeploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME;
  return (
    (Boolean(azureApiKey) || Boolean(azureClientCreds)) &&
    Boolean(deploymentName) &&
    Boolean(openaiDeploymentName)
  );
}

/**
 * Checks whether Anthropic configuration is available.
 *
 * Anthropic is used if no OpenAI API key is provided and an Anthropic API key exists.
 *
 * @param env - Optional overrides for environment variables.
 * @returns True if Anthropic configuration is detected.
 */
function isAnthropicConfigured(env?: EnvOverrides): boolean {
  return (
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    Boolean(getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY)
  );
}

/**
 * Asynchronously checks whether Google (Vertex) configuration is available.
 *
 * Google is used if no OpenAI API key is provided and Google default credentials are detected.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A promise that resolves to true if Google configuration is detected.
 */
async function isGoogleConfigured(env?: EnvOverrides): Promise<boolean> {
  if (!getEnvString('OPENAI_API_KEY') && !env?.OPENAI_API_KEY) {
    return await hasGoogleDefaultCredentials();
  }
  return false;
}

/**
 * Checks whether OpenAI configuration is available.
 *
 * OpenAI is used if an OpenAI API key is present (either from environment or overrides).
 *
 * @param env - Optional overrides for environment variables.
 * @returns True if OpenAI configuration is detected.
 */
function isOpenAIConfigured(env?: EnvOverrides): boolean {
  return Boolean(getEnvString('OPENAI_API_KEY') || env?.OPENAI_API_KEY);
}

/**
 * Constructs and returns the Azure providers.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A DefaultProviders object configured for Azure OpenAI.
 *
 * @throws Error if required Azure deployment settings are missing.
 */
function getAzureProviders(env?: EnvOverrides): DefaultProviders {
  const deploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME;
  if (!deploymentName) {
    throw new Error('AZURE_OPENAI_DEPLOYMENT_NAME must be set when using Azure OpenAI');
  }
  const embeddingDeploymentName =
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
    deploymentName;
  const azureProvider = new AzureChatCompletionProvider(deploymentName, { env });
  const azureEmbeddingProvider = new AzureEmbeddingProvider(embeddingDeploymentName, { env });
  return {
    datasetGenerationProvider: azureProvider,
    embeddingProvider: azureEmbeddingProvider,
    gradingJsonProvider: azureProvider,
    gradingProvider: azureProvider,
    moderationProvider: OpenAiModerationProvider,
    suggestionsProvider: azureProvider,
    synthesizeProvider: azureProvider,
  };
}

/**
 * Constructs and returns the Anthropic providers.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A DefaultProviders object configured for Anthropic.
 */
function getAnthropicProviders(env?: EnvOverrides): DefaultProviders {
  return {
    datasetGenerationProvider: AnthropicGradingProvider,
    embeddingProvider: OpenAiEmbeddingProvider, // TODO: Consider alternate provider
    gradingJsonProvider: AnthropicGradingJsonProvider,
    gradingProvider: AnthropicGradingProvider,
    llmRubricProvider: AnthropicLlmRubricProvider,
    moderationProvider: OpenAiModerationProvider,
    suggestionsProvider: AnthropicSuggestionsProvider,
    synthesizeProvider: AnthropicGradingJsonProvider,
  };
}

/**
 * Constructs and returns the Google (Vertex) providers.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A DefaultProviders object configured for Google.
 */
function getGoogleProviders(env?: EnvOverrides): DefaultProviders {
  return {
    datasetGenerationProvider: GeminiGradingProvider,
    embeddingProvider: GeminiEmbeddingProvider,
    gradingJsonProvider: GeminiGradingProvider,
    gradingProvider: GeminiGradingProvider,
    moderationProvider: OpenAiModerationProvider,
    suggestionsProvider: GeminiGradingProvider,
    synthesizeProvider: GeminiGradingProvider,
  };
}

/**
 * Constructs and returns the OpenAI providers.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A DefaultProviders object configured for OpenAI.
 */
function getOpenAIProviders(env?: EnvOverrides): DefaultProviders {
  return {
    datasetGenerationProvider: OpenAiGradingProvider,
    embeddingProvider: OpenAiEmbeddingProvider,
    gradingJsonProvider: OpenAiGradingJsonProvider,
    gradingProvider: OpenAiGradingProvider,
    moderationProvider: OpenAiModerationProvider,
    suggestionsProvider: OpenAiSuggestionsProvider,
    synthesizeProvider: OpenAiGradingJsonProvider,
  };
}

/**
 * Returns the default API providers based on the current environment configuration.
 *
 * Provider preference order:
 *  1. OpenAI: Chosen if an OpenAI API key is provided.
 *  2. Azure: Chosen if Azure credentials and deployment names are provided and no OpenAI API key is present.
 *  3. Anthropic: Chosen if an Anthropic API key is present and no OpenAI API key is provided.
 *  4. Google (Vertex): Chosen if Google default credentials are detected and no OpenAI API key is provided.
 *
 * Global completion and embedding provider overrides (if set) are applied after the initial configuration.
 *
 * @param env - Optional overrides for environment variables.
 * @returns A promise that resolves to the configured DefaultProviders object.
 */
export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  let providers: DefaultProviders;
  if (isOpenAIConfigured(env)) {
    logger.debug('Using OpenAI default providers');
    providers = getOpenAIProviders(env);
  } else if (isAzureConfigured(env)) {
    logger.debug('Using Azure OpenAI default providers');
    providers = getAzureProviders(env);
  } else if (isAnthropicConfigured(env)) {
    logger.debug('Using Anthropic default providers');
    providers = getAnthropicProviders(env);
  } else if (await isGoogleConfigured(env)) {
    logger.debug('Using Google default providers');
    providers = getGoogleProviders(env);
  } else {
    logger.debug('Defaulting to OpenAI default providers');
    providers = getOpenAIProviders(env);
  }

  if (defaultCompletionProvider) {
    logger.debug(`Overriding default completion provider: ${defaultCompletionProvider.id()}`);
    COMPLETION_PROVIDERS.forEach((providerKey) => {
      providers[providerKey] = defaultCompletionProvider;
    });
  }

  if (defaultEmbeddingProvider) {
    EMBEDDING_PROVIDERS.forEach((providerKey) => {
      providers[providerKey] = defaultEmbeddingProvider;
    });
  }
  return providers;
}
