import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
// Re-export models to maintain backward compatibility
export { DEFAULT_AZURE_API_VERSION, AZURE_MODELS } from './models';

/**
 * Azure provider configuration
 * This version supports environment variables directly
 */
export const AzureProviderConfig: ProviderConfiguration = async (env?: EnvOverrides) => {
  logger.debug('Using Azure OpenAI default providers');

  // Use dynamic imports to avoid circular dependencies
  const { AzureChatCompletionProvider } = await import('./chat');
  const { AzureEmbeddingProvider } = await import('./embedding');
  const { AzureModerationProvider } = await import('./moderation');

  const deploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_DEPLOYMENT_NAME ||
    getEnvString('AZURE_DEPLOYMENT_NAME') ||
    env?.AZURE_DEPLOYMENT_NAME;

  if (!deploymentName) {
    throw new Error(
      'AZURE_OPENAI_DEPLOYMENT_NAME or AZURE_DEPLOYMENT_NAME must be set when using Azure OpenAI',
    );
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
