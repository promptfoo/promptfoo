import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider } from '../types/providers';
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

// Provider implementations
type ProviderImplementation = 'openai' | 'anthropic' | 'vertex' | 'azure';

// Provider config
interface ProviderConfig {
  check: (env?: Record<string, string | undefined>) => Promise<boolean>;
  create: (env?: Record<string, string | undefined>) => Promise<DefaultProviders>;
  config?: {
    apiKey?: string;
    model?: string;
    apiBaseUrl?: string;
    organization?: string;
    projectId?: string;
    location?: string;
    deploymentName?: string;
    embeddingDeploymentName?: string;
    apiVersion?: string;
    resourceName?: string;
  };
}

// Default provider keys and interface
interface DefaultProviders {
  datasetGenerationProvider: ApiProvider;
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
}

type DefaultProviderKey = keyof DefaultProviders;

const PROVIDER_ORDER: readonly ProviderImplementation[] = [
  'openai',
  'anthropic',
  'vertex',
  'azure',
] as const;

const COMPLETION_PROVIDER_KEYS: readonly DefaultProviderKey[] = [
  'datasetGenerationProvider',
  'gradingJsonProvider',
  'gradingProvider',
  'llmRubricProvider',
  'suggestionsProvider',
  'synthesizeProvider',
] as const;

const EMBEDDING_PROVIDER_KEYS: readonly DefaultProviderKey[] = ['embeddingProvider'] as const;

let defaultCompletionProvider: ApiProvider;
let defaultEmbeddingProvider: ApiProvider;

export async function setDefaultCompletionProviders(provider: ApiProvider): Promise<void> {
  defaultCompletionProvider = provider;
}

export async function setDefaultEmbeddingProviders(provider: ApiProvider): Promise<void> {
  defaultEmbeddingProvider = provider;
}

const providers: Record<ProviderImplementation, ProviderConfig> = {
  openai: {
    check: async (env?: Record<string, string | undefined>) =>
      Boolean(env?.OPENAI_API_KEY || getEnvString('OPENAI_API_KEY')),
    create: async () => ({
      datasetGenerationProvider: OpenAiGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingJsonProvider: OpenAiGradingJsonProvider,
      gradingProvider: OpenAiGradingProvider,
      llmRubricProvider: OpenAiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: OpenAiSuggestionsProvider,
      synthesizeProvider: OpenAiGradingJsonProvider,
    }),
    config: {
      apiKey: getEnvString('OPENAI_API_KEY'),
      apiBaseUrl: getEnvString('OPENAI_API_BASE_URL'),
      organization: getEnvString('OPENAI_ORGANIZATION'),
    },
  },

  anthropic: {
    check: async (env?: Record<string, string | undefined>) =>
      Boolean(env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY')),
    create: async () => ({
      datasetGenerationProvider: AnthropicGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingJsonProvider: AnthropicGradingJsonProvider,
      gradingProvider: AnthropicGradingProvider,
      llmRubricProvider: AnthropicLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
      synthesizeProvider: AnthropicGradingJsonProvider,
    }),
    config: {
      apiKey: getEnvString('ANTHROPIC_API_KEY'),
    },
  },

  vertex: {
    check: hasGoogleDefaultCredentials,
    create: async () => ({
      datasetGenerationProvider: GeminiGradingProvider,
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      gradingProvider: GeminiGradingProvider,
      llmRubricProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GeminiGradingProvider,
      synthesizeProvider: GeminiGradingProvider,
    }),
    config: {
      projectId: process.env.GOOGLE_PROJECT_ID,
      location: process.env.GOOGLE_LOCATION,
    },
  },

  azure: {
    check: async (env?: Record<string, string | undefined>) => {
      const hasKey = Boolean(
        env?.AZURE_OPENAI_API_KEY ||
          env?.AZURE_API_KEY ||
          getEnvString('AZURE_OPENAI_API_KEY') ||
          getEnvString('AZURE_API_KEY'),
      );
      const hasDeployment = Boolean(
        env?.AZURE_OPENAI_DEPLOYMENT_NAME || getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME'),
      );
      return hasKey && hasDeployment;
    },
    create: async (env?: Record<string, string | undefined>) => {
      const deploymentName =
        env?.AZURE_OPENAI_DEPLOYMENT_NAME || getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME');

      if (!deploymentName) {
        throw new Error('Azure deployment name is required');
      }

      const embeddingDeploymentName =
        env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
        getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
        deploymentName;

      const provider = new AzureChatCompletionProvider(deploymentName, { env });
      const embeddingProvider = new AzureEmbeddingProvider(embeddingDeploymentName, { env });

      return {
        datasetGenerationProvider: provider,
        embeddingProvider,
        gradingJsonProvider: provider,
        gradingProvider: provider,
        llmRubricProvider: provider,
        moderationProvider: OpenAiModerationProvider,
        suggestionsProvider: provider,
        synthesizeProvider: provider,
      };
    },
    config: {
      apiKey: getEnvString('AZURE_OPENAI_API_KEY') || getEnvString('AZURE_API_KEY'),
      deploymentName: getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || '',
      embeddingDeploymentName: getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME'),
      apiVersion: process.env.AZURE_API_VERSION,
      resourceName: process.env.AZURE_RESOURCE_NAME,
    },
  },
};

const applyOverrides = (providers: DefaultProviders): DefaultProviders => {
  if (defaultCompletionProvider) {
    logger.debug(`Overriding completion provider: ${defaultCompletionProvider.id()}`);
    COMPLETION_PROVIDER_KEYS.forEach((key) => {
      providers[key] = defaultCompletionProvider;
    });
  }
  if (defaultEmbeddingProvider) {
    EMBEDDING_PROVIDER_KEYS.forEach((key) => {
      providers[key] = defaultEmbeddingProvider;
    });
  }
  return providers;
};

export const getDefaultProviders = async (
  env?: Record<string, string | undefined>,
): Promise<DefaultProviders> => {
  for (const provider of PROVIDER_ORDER) {
    if (await providers[provider].check(env)) {
      logger.debug(`Using ${provider} provider`);
      return applyOverrides(await providers[provider].create(env));
    }
  }
  throw new Error('No valid provider configuration found');
};

export const getAvailableProviders = (
  env?: Record<string, string | undefined>,
): Promise<ProviderImplementation[]> =>
  Promise.all(
    PROVIDER_ORDER.map(async (provider) => ({
      provider,
      available: await providers[provider].check(env),
    })),
  ).then((results) => results.filter(({ available }) => available).map(({ provider }) => provider));

export const getProviderPriority = (provider: ProviderImplementation): number =>
  PROVIDER_ORDER.indexOf(provider);
