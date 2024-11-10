import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, EnvOverrides } from '../types';
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
} from './openai';
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

  if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    return {
      datasetGenerationProvider: AnthropicGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): Voyager instead?
      gradingJsonProvider: AnthropicGradingJsonProvider,
      gradingProvider: AnthropicGradingProvider,
      llmRubricProvider: AnthropicLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
      synthesizeProvider: AnthropicGradingJsonProvider,
    };
  }

  const preferGoogle =
    !process.env.OPENAI_API_KEY && !env?.OPENAI_API_KEY && (await hasGoogleDefaultCredentials());
  if (preferGoogle) {
    logger.debug('Using Google default providers');
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

  logger.debug('Using OpenAI default providers');
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
