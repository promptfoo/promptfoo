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
  const preferAnthropic =
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    (getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY);

  const hasAzureApiKey =
    getEnvString('AZURE_OPENAI_API_KEY') ||
    env?.AZURE_OPENAI_API_KEY ||
    getEnvString('AZURE_API_KEY') ||
    env?.AZURE_API_KEY;
  const hasAzureClientCreds =
    (getEnvString('AZURE_CLIENT_ID') || env?.AZURE_CLIENT_ID) &&
    (getEnvString('AZURE_CLIENT_SECRET') || env?.AZURE_CLIENT_SECRET) &&
    (getEnvString('AZURE_TENANT_ID') || env?.AZURE_TENANT_ID);

  const preferAzure =
    !getEnvString('OPENAI_API_KEY') &&
    !env?.OPENAI_API_KEY &&
    (hasAzureApiKey || hasAzureClientCreds) &&
    (getEnvString('AZURE_DEPLOYMENT_NAME') || env?.AZURE_DEPLOYMENT_NAME) &&
    (getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME);

  let providers: Pick<DefaultProviders, keyof DefaultProviders>;

  if (preferAzure) {
    logger.debug('Using Azure OpenAI default providers');
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
    logger.debug(`Overriding default completion provider: ${defaultCompletionProvider.id()}`);
    COMPLETION_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultCompletionProvider;
    });
  }

  if (defaultEmbeddingProvider) {
    EMBEDDING_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultEmbeddingProvider;
    });
  }
  return providers;
}
