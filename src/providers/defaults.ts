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
 * This will override all of the completion type providers defined in the constant COMPLETION_PROVIDERS
 * @param provider - The provider to set as the default completion provider.
 */
export async function setDefaultCompletionProviders(provider: ApiProvider) {
  defaultCompletionProvider = provider;
}

export async function setDefaultEmbeddingProviders(provider: ApiProvider) {
  defaultEmbeddingProvider = provider;
}

export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  logger.debug(`Getting default providers (with env overrides: ${env ? 'yes' : 'no'})`);

  const anthropicApiKey = getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY;
  const openAiApiKey = getEnvString('OPENAI_API_KEY') || env?.OPENAI_API_KEY;
  logger.debug(`API Keys present - Anthropic: ${!!anthropicApiKey}, OpenAI: ${!!openAiApiKey}`);

  const preferAnthropic =
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    (getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY);
  logger.debug(`Prefer Anthropic: ${preferAnthropic}`);

  const hasAzureApiKey =
    getEnvString('AZURE_OPENAI_API_KEY') ||
    env?.AZURE_OPENAI_API_KEY ||
    getEnvString('AZURE_API_KEY') ||
    env?.AZURE_API_KEY;
  const hasAzureClientCreds =
    (getEnvString('AZURE_CLIENT_ID') || env?.AZURE_CLIENT_ID) &&
    (getEnvString('AZURE_CLIENT_SECRET') || env?.AZURE_CLIENT_SECRET) &&
    (getEnvString('AZURE_TENANT_ID') || env?.AZURE_TENANT_ID);
  logger.debug(`Azure credentials status - API Key: ${hasAzureApiKey}, Client Credentials: ${hasAzureClientCreds}`);

  const preferAzure =
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    (hasAzureApiKey || hasAzureClientCreds) &&
    (getEnvString('AZURE_DEPLOYMENT_NAME') || env?.AZURE_DEPLOYMENT_NAME) &&
    (getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME);
  logger.debug(`Prefer Azure: ${preferAzure}`);

  let providers: Pick<DefaultProviders, keyof DefaultProviders>;

  if (preferAzure) {
    logger.debug('Initializing Azure OpenAI providers');
    const deploymentName =
      getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME;
    logger.debug(`Azure deployment name: ${deploymentName}`);
    if (!deploymentName) {
      throw new Error('AZURE_OPENAI_DEPLOYMENT_NAME must be set when using Azure OpenAI');
    }

    const embeddingDeploymentName =
      getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
      env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
      deploymentName;

    const azureProvider = new AzureChatCompletionProvider(deploymentName, { env });
    const azureEmbeddingProvider = new AzureEmbeddingProvider(embeddingDeploymentName, {
      env,
    });

    providers = {
      datasetGenerationProvider: azureProvider,
      embeddingProvider: azureEmbeddingProvider,
      gradingJsonProvider: azureProvider,
      gradingProvider: azureProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: azureProvider,
      synthesizeProvider: azureProvider,
    };
  } else if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    logger.debug(`Anthropic API Key status: ${!!anthropicApiKey}`);
    providers = {
      datasetGenerationProvider: AnthropicGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): Voyager instead?
      gradingJsonProvider: AnthropicGradingJsonProvider,
      gradingProvider: AnthropicGradingProvider,
      llmRubricProvider: AnthropicLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
      synthesizeProvider: AnthropicGradingJsonProvider,
    };
  } else if (
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    (await hasGoogleDefaultCredentials())
  ) {
    logger.debug('Using Google default providers');
    providers = {
      datasetGenerationProvider: GeminiGradingProvider,
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      gradingProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GeminiGradingProvider,
      synthesizeProvider: GeminiGradingProvider,
    };
  } else {
    logger.debug('Using OpenAI default providers');
    providers = {
      datasetGenerationProvider: OpenAiGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingJsonProvider: OpenAiGradingJsonProvider,
      gradingProvider: OpenAiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: OpenAiSuggestionsProvider,
      synthesizeProvider: OpenAiGradingJsonProvider,
    };
  }
  if (defaultCompletionProvider) {
    logger.debug(`Overriding completion providers with: ${defaultCompletionProvider.id()}`);
    logger.debug(`Affected providers: ${COMPLETION_PROVIDERS.join(', ')}`);
    COMPLETION_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultCompletionProvider;
    });
  }

  if (defaultEmbeddingProvider) {
    logger.debug(`Overriding embedding providers with: ${defaultEmbeddingProvider.id()}`);
    logger.debug(`Affected providers: ${EMBEDDING_PROVIDERS.join(', ')}`);
    EMBEDDING_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultEmbeddingProvider;
    });
  }
  logger.debug(`Final provider configuration: ${Object.keys(providers).join(', ')}`);
  return providers;
}
