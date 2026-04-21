import { getEnvString } from '../envars';
import logger from '../logger';
import { getAnthropicProviders } from './anthropic/defaults';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureModerationProvider } from './azure/moderation';
import {
  DefaultGitHubGradingJsonProvider,
  DefaultGitHubGradingProvider,
  DefaultGitHubSuggestionsProvider,
} from './github/defaults';
import {
  DefaultGradingJsonProvider as GoogleAiStudioGradingJsonProvider,
  DefaultGradingProvider as GoogleAiStudioGradingProvider,
  DefaultLlmRubricProvider as GoogleAiStudioLlmRubricProvider,
  DefaultSuggestionsProvider as GoogleAiStudioSuggestionsProvider,
  DefaultSynthesizeProvider as GoogleAiStudioSynthesizeProvider,
} from './google/ai.studio';
import { hasGoogleDefaultCredentials } from './google/util';
import {
  DefaultEmbeddingProvider as GeminiEmbeddingProvider,
  DefaultGradingProvider as GeminiGradingProvider,
} from './google/vertex';
import {
  DefaultEmbeddingProvider as MistralEmbeddingProvider,
  DefaultGradingJsonProvider as MistralGradingJsonProvider,
  DefaultGradingProvider as MistralGradingProvider,
  DefaultSuggestionsProvider as MistralSuggestionsProvider,
  DefaultSynthesizeProvider as MistralSynthesizeProvider,
} from './mistral/defaults';
import { getCodexDefaultProviders, hasCodexDefaultCredentials } from './openai/codexDefaults';
import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultModerationProvider as OpenAiModerationProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
  DefaultWebSearchProvider as OpenAiWebSearchProvider,
} from './openai/defaults';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, DefaultProviders } from '../types/index';

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

interface DefaultProviderPreferences {
  preferAnthropic: boolean;
  preferAzure: boolean;
  useCodexDefaults: boolean;
  useGitHubDefaults: boolean;
  useGoogleAiStudioDefaults: boolean;
  useGoogleVertexDefaults: boolean;
  useMistralDefaults: boolean;
}

async function getDefaultProviderPreferences(
  env?: EnvOverrides,
): Promise<DefaultProviderPreferences> {
  const hasAnthropicCredentials = Boolean(
    getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY,
  );
  const hasOpenAiCredentials = Boolean(getEnvString('OPENAI_API_KEY') || env?.OPENAI_API_KEY);
  const hasGitHubCredentials = Boolean(getEnvString('GITHUB_TOKEN') || env?.GITHUB_TOKEN);
  const hasGoogleAiStudioCredentials = Boolean(
    getEnvString('GEMINI_API_KEY') ||
      env?.GEMINI_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      env?.GOOGLE_API_KEY ||
      getEnvString('PALM_API_KEY') ||
      env?.PALM_API_KEY,
  );
  const hasAzureApiKey =
    getEnvString('AZURE_OPENAI_API_KEY') ||
    env?.AZURE_OPENAI_API_KEY ||
    getEnvString('AZURE_API_KEY') ||
    env?.AZURE_API_KEY;
  const hasAzureClientCreds =
    (getEnvString('AZURE_CLIENT_ID') || env?.AZURE_CLIENT_ID) &&
    (getEnvString('AZURE_CLIENT_SECRET') || env?.AZURE_CLIENT_SECRET) &&
    (getEnvString('AZURE_TENANT_ID') || env?.AZURE_TENANT_ID);
  const hasMistralCredentials = Boolean(getEnvString('MISTRAL_API_KEY') || env?.MISTRAL_API_KEY);

  const preferAzure = Boolean(
    !hasOpenAiCredentials &&
      (hasAzureApiKey || hasAzureClientCreds) &&
      (getEnvString('AZURE_DEPLOYMENT_NAME') || env?.AZURE_DEPLOYMENT_NAME) &&
      (getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME),
  );
  const preferAnthropic = !hasOpenAiCredentials && hasAnthropicCredentials;
  const shouldUseFallbackDefaults =
    !preferAzure &&
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials;
  const useGoogleVertexDefaults = shouldUseFallbackDefaults
    ? await hasGoogleDefaultCredentials()
    : false;
  const useNonGoogleFallbackDefaults = shouldUseFallbackDefaults && !useGoogleVertexDefaults;
  const hasCodexCredentials =
    useNonGoogleFallbackDefaults && !hasMistralCredentials && hasCodexDefaultCredentials(env);

  return {
    preferAnthropic,
    preferAzure,
    useCodexDefaults: hasCodexCredentials,
    useGitHubDefaults:
      useNonGoogleFallbackDefaults &&
      !hasMistralCredentials &&
      !hasCodexCredentials &&
      hasGitHubCredentials,
    useGoogleAiStudioDefaults:
      !hasOpenAiCredentials && !hasAnthropicCredentials && hasGoogleAiStudioCredentials,
    useGoogleVertexDefaults,
    useMistralDefaults: useNonGoogleFallbackDefaults && hasMistralCredentials,
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
  const {
    preferAnthropic,
    preferAzure,
    useCodexDefaults,
    useGitHubDefaults,
    useGoogleAiStudioDefaults,
    useGoogleVertexDefaults,
    useMistralDefaults,
  } = await getDefaultProviderPreferences(env);

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
      embeddingProvider: azureEmbeddingProvider,
      gradingJsonProvider: azureProvider,
      gradingProvider: azureProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: azureProvider,
      synthesizeProvider: azureProvider,
      // Azure doesn't have web search by default
    };
  } else if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    const anthropicProviders = getAnthropicProviders(env);

    providers = {
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): Voyager instead?
      gradingJsonProvider: anthropicProviders.gradingJsonProvider,
      gradingProvider: anthropicProviders.gradingProvider,
      llmRubricProvider: anthropicProviders.llmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: anthropicProviders.suggestionsProvider,
      synthesizeProvider: anthropicProviders.synthesizeProvider,
      webSearchProvider: anthropicProviders.webSearchProvider,
    };
  } else if (useGoogleAiStudioDefaults) {
    logger.debug('Using Google AI Studio default providers');
    providers = {
      embeddingProvider: GeminiEmbeddingProvider, // Google AI Studio doesn't support embeddings, fall back to Vertex
      gradingJsonProvider: GoogleAiStudioGradingJsonProvider,
      gradingProvider: GoogleAiStudioGradingProvider,
      llmRubricProvider: GoogleAiStudioLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GoogleAiStudioSuggestionsProvider,
      synthesizeProvider: GoogleAiStudioSynthesizeProvider,
    };
  } else if (useGoogleVertexDefaults) {
    logger.debug('Using Google Vertex default providers');
    providers = {
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      gradingProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GeminiGradingProvider,
      synthesizeProvider: GeminiGradingProvider,
    };
  } else if (useMistralDefaults) {
    logger.debug('Using Mistral default providers');
    providers = {
      embeddingProvider: MistralEmbeddingProvider,
      gradingJsonProvider: MistralGradingJsonProvider,
      gradingProvider: MistralGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: MistralSuggestionsProvider,
      synthesizeProvider: MistralSynthesizeProvider,
      // Mistral doesn't have web search
    };
  } else if (useCodexDefaults) {
    logger.debug('Using Codex SDK default providers from ChatGPT/Codex credentials');
    providers = {
      embeddingProvider: OpenAiEmbeddingProvider,
      moderationProvider: OpenAiModerationProvider,
      ...getCodexDefaultProviders(env),
    };
  } else if (useGitHubDefaults) {
    logger.debug('Using GitHub Models default providers');
    providers = {
      embeddingProvider: OpenAiEmbeddingProvider, // GitHub doesn't support embeddings yet
      gradingJsonProvider: DefaultGitHubGradingJsonProvider,
      gradingProvider: DefaultGitHubGradingProvider,
      moderationProvider: OpenAiModerationProvider, // GitHub doesn't have moderation
      suggestionsProvider: DefaultGitHubSuggestionsProvider,
      synthesizeProvider: DefaultGitHubGradingJsonProvider,
    };
  } else {
    logger.debug('Using OpenAI default providers');

    providers = {
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingJsonProvider: OpenAiGradingJsonProvider,
      gradingProvider: OpenAiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: OpenAiSuggestionsProvider,
      synthesizeProvider: OpenAiGradingJsonProvider,
      webSearchProvider: OpenAiWebSearchProvider,
    };
  }

  // If Azure Content Safety endpoint is available, use it for moderation
  if (getEnvString('AZURE_CONTENT_SAFETY_ENDPOINT') || env?.AZURE_CONTENT_SAFETY_ENDPOINT) {
    providers.moderationProvider = new AzureModerationProvider('text-content-safety', { env });
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
