import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { AzureChatCompletionProvider, AzureEmbeddingProvider } from '../azure';
import { OpenAiModerationProvider } from '../openai/moderation';
import { AzureModerationProvider } from './moderation';

/**
 * Azure provider configuration
 * This version supports environment variables directly
 */
export const AzureProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
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

  // Use Azure Content Safety if available, otherwise fallback to OpenAI
  const moderationProvider =
    getEnvString('AZURE_CONTENT_SAFETY_ENDPOINT') || env?.AZURE_CONTENT_SAFETY_ENDPOINT
      ? new AzureModerationProvider('text-content-safety', { env })
      : new OpenAiModerationProvider('omni-moderation-latest');

  return {
    datasetGenerationProvider: azureProvider,
    embeddingProvider: azureEmbeddingProvider,
    gradingJsonProvider: azureProvider,
    gradingProvider: azureProvider,
    moderationProvider,
    suggestionsProvider: azureProvider,
    synthesizeProvider: azureProvider,
  };
};
