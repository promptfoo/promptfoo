import { getEnvString } from '../envars';
import logger from '../logger';
import { getAnthropicProviders } from './anthropic/defaults';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureModerationProvider } from './azure/moderation';
import { resolveProviderApiKey } from './credentials';
import { AIStudioEmbeddingProvider, getGoogleAiStudioProviders } from './google/ai.studio';
import { hasGoogleDefaultCredentials } from './google/util';
import { getGoogleVertexEmbeddingProvider, getGoogleVertexProviders } from './google/vertex';
import { getMistralProviders } from './mistral/defaults';
import { getCodexDefaultProviders, hasCodexDefaultCredentials } from './openai/codexDefaults';
import { getOpenAiProviders } from './openai/defaults';
import { VoyageEmbeddingProvider } from './voyage';
import { getXAIProviders } from './xai/defaults';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, DefaultProviders } from '../types/index';

const COMPLETION_PROVIDERS = [
  'gradingJsonProvider',
  'gradingProvider',
  'llmRubricProvider',
  'suggestionsProvider',
  'synthesizeProvider',
] as const;

let defaultCompletionProvider: ApiProvider;
let defaultEmbeddingProvider: ApiProvider;

const missingEmbeddingProvider: ApiProvider = {
  id: () => 'embedding:unconfigured',
  async callApi() {
    return {
      error:
        'No embedding provider is configured. Set an embedding provider on the assertion or configure supported embedding credentials.',
    };
  },
  async callEmbeddingApi() {
    return this.callApi('');
  },
};

async function getDefaultEmbeddingProvider(
  openAiEmbedding: ApiProvider,
  env: EnvOverrides | undefined,
  hasGoogleCredentials: () => Promise<boolean>,
): Promise<ApiProvider> {
  if (defaultEmbeddingProvider) {
    return defaultEmbeddingProvider;
  }
  if (resolveProviderApiKey(undefined, env, ['OPENAI_API_KEY'])) {
    return openAiEmbedding;
  }

  const embeddingDeploymentName =
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ??
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME');
  // A deployment alone can use the Azure CLI. Explicitly cleared scoped
  // credentials must not fall through to ambient credentials.
  const azureCredentialCleared = [
    'AZURE_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
  ].some((key) => env?.[key] === '');
  if (embeddingDeploymentName && !azureCredentialCleared) {
    return new AzureEmbeddingProvider(embeddingDeploymentName, { env });
  }

  // A chat deployment is not an embedding deployment. Prefer configured embedding
  // API credentials before probing ADC, without changing Azure's chat selection.
  if (resolveProviderApiKey(undefined, env, ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PALM_API_KEY'])) {
    return new AIStudioEmbeddingProvider('gemini-embedding-001', { env });
  }
  if (resolveProviderApiKey(undefined, env, ['MISTRAL_API_KEY'])) {
    return getMistralProviders(env).embeddingProvider;
  }
  if (resolveProviderApiKey(undefined, env, ['VOYAGE_API_KEY'])) {
    return new VoyageEmbeddingProvider('voyage-3.5', {}, env);
  }
  if (await hasGoogleCredentials()) {
    return getGoogleVertexEmbeddingProvider(env);
  }
  return missingEmbeddingProvider;
}

interface DefaultProviderPreferences {
  preferAnthropic: boolean;
  preferAzure: boolean;
  useCodexDefaults: boolean;
  useGoogleAiStudioDefaults: boolean;
  useGoogleVertexDefaults: boolean;
  useMistralDefaults: boolean;
  useXAIDefaults: boolean;
}

async function getDefaultProviderPreferences(
  env: EnvOverrides | undefined,
  hasGoogleCredentials: () => Promise<boolean>,
): Promise<DefaultProviderPreferences> {
  const hasAnthropicCredentials = Boolean(
    resolveProviderApiKey(undefined, env, ['ANTHROPIC_API_KEY']),
  );
  const hasOpenAiCredentials = Boolean(resolveProviderApiKey(undefined, env, ['OPENAI_API_KEY']));
  const hasGoogleAiStudioCredentials = Boolean(
    resolveProviderApiKey(undefined, env, ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PALM_API_KEY']),
  );
  const hasAzureApiKey = resolveProviderApiKey(undefined, env, [
    'AZURE_API_KEY',
    'AZURE_OPENAI_API_KEY',
  ]);
  const hasAzureClientCreds =
    (env?.AZURE_CLIENT_ID ?? getEnvString('AZURE_CLIENT_ID')) &&
    (env?.AZURE_CLIENT_SECRET ?? getEnvString('AZURE_CLIENT_SECRET')) &&
    (env?.AZURE_TENANT_ID ?? getEnvString('AZURE_TENANT_ID'));
  const hasMistralCredentials = Boolean(resolveProviderApiKey(undefined, env, ['MISTRAL_API_KEY']));
  const hasXAICredentials = Boolean(resolveProviderApiKey(undefined, env, ['XAI_API_KEY']));

  const preferAzure = Boolean(
    !hasOpenAiCredentials &&
      (hasAzureApiKey || hasAzureClientCreds) &&
      (env?.AZURE_DEPLOYMENT_NAME ?? getEnvString('AZURE_DEPLOYMENT_NAME')) &&
      (env?.AZURE_OPENAI_DEPLOYMENT_NAME ?? getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME')),
  );
  const preferAnthropic = !hasOpenAiCredentials && hasAnthropicCredentials;
  const shouldUseFallbackDefaults =
    !preferAzure &&
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials;
  const useGoogleVertexDefaults = shouldUseFallbackDefaults ? await hasGoogleCredentials() : false;
  const useNonGoogleFallbackDefaults = shouldUseFallbackDefaults && !useGoogleVertexDefaults;
  const hasCodexCredentials =
    useNonGoogleFallbackDefaults &&
    !hasMistralCredentials &&
    !hasXAICredentials &&
    hasCodexDefaultCredentials(env);

  return {
    preferAnthropic,
    preferAzure,
    useCodexDefaults: hasCodexCredentials,
    useGoogleAiStudioDefaults:
      !hasOpenAiCredentials && !hasAnthropicCredentials && hasGoogleAiStudioCredentials,
    useGoogleVertexDefaults,
    useMistralDefaults: useNonGoogleFallbackDefaults && hasMistralCredentials,
    useXAIDefaults: useNonGoogleFallbackDefaults && !hasMistralCredentials && hasXAICredentials,
  };
}

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
  let googleCredentials: Promise<boolean> | undefined;
  const hasGoogleCredentials = () => (googleCredentials ??= hasGoogleDefaultCredentials());
  const {
    preferAnthropic,
    preferAzure,
    useCodexDefaults,
    useGoogleAiStudioDefaults,
    useGoogleVertexDefaults,
    useMistralDefaults,
    useXAIDefaults,
  } = await getDefaultProviderPreferences(env, hasGoogleCredentials);

  const openAiProviders = getOpenAiProviders(env);

  let providers: Omit<DefaultProviders, 'embeddingProvider'>;

  if (preferAzure) {
    logger.debug('Using Azure OpenAI default providers');
    const deploymentName =
      env?.AZURE_OPENAI_DEPLOYMENT_NAME ?? getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME');
    if (!deploymentName) {
      throw new Error('AZURE_OPENAI_DEPLOYMENT_NAME must be set when using Azure OpenAI');
    }

    const azureProvider = new AzureChatCompletionProvider(deploymentName, { env });

    providers = {
      gradingJsonProvider: azureProvider,
      gradingProvider: azureProvider,
      moderationProvider: openAiProviders.moderationProvider,
      suggestionsProvider: azureProvider,
      synthesizeProvider: azureProvider,
      // Azure doesn't have web search by default
    };
  } else if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    const anthropicProviders = getAnthropicProviders(env);

    providers = {
      gradingJsonProvider: anthropicProviders.gradingJsonProvider,
      gradingProvider: anthropicProviders.gradingProvider,
      llmRubricProvider: anthropicProviders.llmRubricProvider,
      moderationProvider: openAiProviders.moderationProvider,
      suggestionsProvider: anthropicProviders.suggestionsProvider,
      synthesizeProvider: anthropicProviders.synthesizeProvider,
      webSearchProvider: anthropicProviders.webSearchProvider,
    };
  } else if (useGoogleAiStudioDefaults) {
    logger.debug('Using Google AI Studio default providers');
    providers = {
      moderationProvider: openAiProviders.moderationProvider,
      ...getGoogleAiStudioProviders(env),
    };
  } else if (useGoogleVertexDefaults) {
    logger.debug('Using Google Vertex default providers');
    providers = {
      moderationProvider: openAiProviders.moderationProvider,
      ...getGoogleVertexProviders(env),
    };
  } else if (useMistralDefaults) {
    logger.debug('Using Mistral default providers');
    const mistralProviders = getMistralProviders(env);
    providers = {
      gradingJsonProvider: mistralProviders.gradingJsonProvider,
      gradingProvider: mistralProviders.gradingProvider,
      moderationProvider: openAiProviders.moderationProvider,
      suggestionsProvider: mistralProviders.suggestionsProvider,
      synthesizeProvider: mistralProviders.synthesizeProvider,
      // Mistral doesn't have web search
    };
  } else if (useXAIDefaults) {
    logger.debug('Using xAI default providers');
    providers = {
      moderationProvider: openAiProviders.moderationProvider, // xAI doesn't expose a moderation API
      ...getXAIProviders(env),
    };
  } else if (useCodexDefaults) {
    logger.debug('Using Codex SDK default providers from ChatGPT/Codex credentials');
    providers = {
      moderationProvider: openAiProviders.moderationProvider,
      ...getCodexDefaultProviders(env),
    };
  } else {
    logger.debug('Using OpenAI default providers');

    providers = {
      gradingJsonProvider: openAiProviders.gradingJsonProvider,
      gradingProvider: openAiProviders.gradingProvider,
      moderationProvider: openAiProviders.moderationProvider,
      suggestionsProvider: openAiProviders.suggestionsProvider,
      synthesizeProvider: openAiProviders.gradingJsonProvider,
      webSearchProvider: openAiProviders.webSearchProvider,
    };
  }

  // If Azure Content Safety endpoint is available, use it for moderation
  if (env?.AZURE_CONTENT_SAFETY_ENDPOINT ?? getEnvString('AZURE_CONTENT_SAFETY_ENDPOINT')) {
    providers.moderationProvider = new AzureModerationProvider('text-content-safety', { env });
  }

  if (defaultCompletionProvider) {
    logger.debug(`Overriding default completion provider: ${defaultCompletionProvider.id()}`);
    COMPLETION_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultCompletionProvider;
    });
  }

  return {
    ...providers,
    embeddingProvider: await getDefaultEmbeddingProvider(
      openAiProviders.embeddingProvider,
      env,
      hasGoogleCredentials,
    ),
  };
}
