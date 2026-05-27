import { getEnvString } from '../envars';
import logger from '../logger';
import { DEFAULT_ANTHROPIC_MODEL, getAnthropicProviders } from './anthropic/defaults';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureModerationProvider } from './azure/moderation';
import {
  DefaultGitHubGradingJsonProvider,
  DefaultGitHubGradingProvider,
  DefaultGitHubSuggestionsProvider,
} from './github/defaults';
import { DEFAULT_AI_STUDIO_MODEL, getGoogleAiStudioProviders } from './google/ai.studio';
import { hasGoogleDefaultCredentials } from './google/util';
import {
  DEFAULT_VERTEX_EMBEDDING_MODEL,
  DEFAULT_VERTEX_MODEL,
  getGoogleVertexEmbeddingProvider,
  getGoogleVertexProviders,
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
import { DEFAULT_XAI_MODEL, getXAIProviders } from './xai/defaults';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  DefaultProviderSelectionInfo,
  DefaultProviders,
  DefaultProvidersWithInfo,
  SkippedProviderInfo,
} from '../types/providers';

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
  detectedCredentials: string[];
  hasAnthropicCredentials: boolean;
  hasAzureApiKey: boolean;
  hasAzureClientCreds: boolean;
  hasAzureContentSafety: boolean;
  hasAzureDeploymentName: boolean;
  hasAzureOpenAiApiKey: boolean;
  hasCodexCredentials: boolean;
  hasGeminiApiKey: boolean;
  hasGitHubCredentials: boolean;
  hasGoogleAiStudioCredentials: boolean;
  hasGoogleApiKey: boolean;
  hasGoogleDefaultCredentials: boolean;
  hasMistralCredentials: boolean;
  hasOpenAiCredentials: boolean;
  hasPalmApiKey: boolean;
  hasXAICredentials: boolean;
  preferAnthropic: boolean;
  preferAzure: boolean;
  useCodexDefaults: boolean;
  useGitHubDefaults: boolean;
  useGoogleAiStudioDefaults: boolean;
  useGoogleVertexDefaults: boolean;
  useMistralDefaults: boolean;
  useXAIDefaults: boolean;
}

type DefaultProviderCredentialState = Pick<
  DefaultProviderPreferences,
  | 'hasAnthropicCredentials'
  | 'hasAzureApiKey'
  | 'hasAzureClientCreds'
  | 'hasAzureContentSafety'
  | 'hasAzureDeploymentName'
  | 'hasAzureOpenAiApiKey'
  | 'hasGeminiApiKey'
  | 'hasGitHubCredentials'
  | 'hasGoogleAiStudioCredentials'
  | 'hasGoogleApiKey'
  | 'hasMistralCredentials'
  | 'hasOpenAiCredentials'
  | 'hasPalmApiKey'
  | 'hasXAICredentials'
>;

type DefaultProviderRoutingState = Pick<
  DefaultProviderPreferences,
  | 'hasCodexCredentials'
  | 'hasGoogleDefaultCredentials'
  | 'preferAnthropic'
  | 'preferAzure'
  | 'useCodexDefaults'
  | 'useGitHubDefaults'
  | 'useGoogleAiStudioDefaults'
  | 'useGoogleVertexDefaults'
  | 'useMistralDefaults'
  | 'useXAIDefaults'
>;

function hasAnyEnvValue(names: string[], env?: EnvOverrides): boolean {
  return names.some((name) => Boolean(getEnvString(name) || env?.[name]));
}

function hasAllEnvValues(names: string[], env?: EnvOverrides): boolean {
  return names.every((name) => Boolean(getEnvString(name) || env?.[name]));
}

function getAzureDeploymentName(env?: EnvOverrides): string | undefined {
  return (
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_DEPLOYMENT_NAME ||
    getEnvString('AZURE_DEPLOYMENT_NAME') ||
    env?.AZURE_DEPLOYMENT_NAME
  );
}

function getDefaultProviderCredentialState(env?: EnvOverrides): DefaultProviderCredentialState {
  const hasAnthropicCredentials = hasAnyEnvValue(['ANTHROPIC_API_KEY'], env);
  const hasGeminiApiKey = hasAnyEnvValue(['GEMINI_API_KEY'], env);
  const hasGoogleApiKey = hasAnyEnvValue(['GOOGLE_API_KEY'], env);
  const hasPalmApiKey = hasAnyEnvValue(['PALM_API_KEY'], env);

  return {
    hasAnthropicCredentials,
    hasAzureApiKey: hasAnyEnvValue(['AZURE_API_KEY'], env),
    hasAzureClientCreds: hasAllEnvValues(
      ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'],
      env,
    ),
    hasAzureContentSafety: hasAnyEnvValue(['AZURE_CONTENT_SAFETY_ENDPOINT'], env),
    hasAzureDeploymentName: Boolean(getAzureDeploymentName(env)),
    hasAzureOpenAiApiKey: hasAnyEnvValue(['AZURE_OPENAI_API_KEY'], env),
    hasGeminiApiKey,
    hasGitHubCredentials: hasAnyEnvValue(['GITHUB_TOKEN'], env),
    hasGoogleAiStudioCredentials: [hasGeminiApiKey, hasGoogleApiKey, hasPalmApiKey].some(Boolean),
    hasGoogleApiKey,
    hasMistralCredentials: hasAnyEnvValue(['MISTRAL_API_KEY'], env),
    hasOpenAiCredentials: hasAnyEnvValue(['OPENAI_API_KEY'], env),
    hasPalmApiKey,
    hasXAICredentials: hasAnyEnvValue(['XAI_API_KEY'], env),
  };
}

async function getDefaultProviderRoutingState(
  credentials: DefaultProviderCredentialState,
  env?: EnvOverrides,
): Promise<DefaultProviderRoutingState> {
  const preferAzure =
    !credentials.hasOpenAiCredentials &&
    (credentials.hasAzureApiKey ||
      credentials.hasAzureOpenAiApiKey ||
      credentials.hasAzureClientCreds) &&
    credentials.hasAzureDeploymentName;
  const preferAnthropic = !credentials.hasOpenAiCredentials && credentials.hasAnthropicCredentials;
  const shouldUseFallbackDefaults =
    !preferAzure &&
    !credentials.hasOpenAiCredentials &&
    !credentials.hasAnthropicCredentials &&
    !credentials.hasGoogleAiStudioCredentials;
  const useGoogleVertexDefaults = shouldUseFallbackDefaults
    ? await hasGoogleDefaultCredentials()
    : false;
  const useNonGoogleFallbackDefaults = shouldUseFallbackDefaults && !useGoogleVertexDefaults;
  const hasCodexCredentials =
    useNonGoogleFallbackDefaults &&
    !credentials.hasMistralCredentials &&
    !credentials.hasXAICredentials &&
    hasCodexDefaultCredentials(env);

  return {
    hasCodexCredentials,
    hasGoogleDefaultCredentials: useGoogleVertexDefaults,
    preferAnthropic,
    preferAzure,
    useCodexDefaults: hasCodexCredentials,
    useGitHubDefaults:
      useNonGoogleFallbackDefaults &&
      !credentials.hasMistralCredentials &&
      !credentials.hasXAICredentials &&
      !hasCodexCredentials &&
      credentials.hasGitHubCredentials,
    useGoogleAiStudioDefaults:
      !credentials.hasOpenAiCredentials &&
      !credentials.hasAnthropicCredentials &&
      credentials.hasGoogleAiStudioCredentials,
    useGoogleVertexDefaults,
    useMistralDefaults: useNonGoogleFallbackDefaults && credentials.hasMistralCredentials,
    useXAIDefaults:
      useNonGoogleFallbackDefaults &&
      !credentials.hasMistralCredentials &&
      credentials.hasXAICredentials,
  };
}

function getDetectedDefaultProviderCredentials({
  credentials,
  routing,
}: {
  credentials: DefaultProviderCredentialState;
  routing: DefaultProviderRoutingState;
}): string[] {
  return [
    [credentials.hasOpenAiCredentials, 'OPENAI_API_KEY'],
    [credentials.hasAnthropicCredentials, 'ANTHROPIC_API_KEY'],
    [credentials.hasGitHubCredentials, 'GITHUB_TOKEN'],
    [credentials.hasGeminiApiKey, 'GEMINI_API_KEY'],
    [credentials.hasGoogleApiKey, 'GOOGLE_API_KEY'],
    [credentials.hasPalmApiKey, 'PALM_API_KEY'],
    [credentials.hasMistralCredentials, 'MISTRAL_API_KEY'],
    [credentials.hasXAICredentials, 'XAI_API_KEY'],
    [credentials.hasAzureOpenAiApiKey, 'AZURE_OPENAI_API_KEY'],
    [credentials.hasAzureApiKey, 'AZURE_API_KEY'],
    [credentials.hasAzureClientCreds, 'AZURE_CLIENT_CREDENTIALS'],
    [routing.useGoogleVertexDefaults, 'GOOGLE_APPLICATION_CREDENTIALS'],
    [routing.hasCodexCredentials, 'CHATGPT_CODEX_CREDENTIALS'],
    [credentials.hasAzureContentSafety, 'AZURE_CONTENT_SAFETY_ENDPOINT'],
  ]
    .filter(([isPresent]) => isPresent)
    .map(([, credential]) => credential as string);
}

async function getDefaultProviderPreferences(
  env?: EnvOverrides,
): Promise<DefaultProviderPreferences> {
  const credentials = getDefaultProviderCredentialState(env);
  const routing = await getDefaultProviderRoutingState(credentials, env);

  return {
    ...credentials,
    ...routing,
    detectedCredentials: getDetectedDefaultProviderCredentials({ credentials, routing }),
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

async function resolveDefaultProviders(
  env?: EnvOverrides,
  preferences?: DefaultProviderPreferences,
): Promise<DefaultProviders> {
  const resolvedPreferences = preferences ?? (await getDefaultProviderPreferences(env));
  const {
    preferAnthropic,
    preferAzure,
    useCodexDefaults,
    useGitHubDefaults,
    useGoogleAiStudioDefaults,
    useGoogleVertexDefaults,
    useMistralDefaults,
    useXAIDefaults,
  } = resolvedPreferences;

  let providers: Pick<DefaultProviders, keyof DefaultProviders>;

  if (preferAzure) {
    logger.debug('Using Azure OpenAI default providers');
    const deploymentName = getAzureDeploymentName(env);
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
      embeddingProvider: getGoogleVertexEmbeddingProvider(env), // AI Studio supports embeddings via google:embedding:*, but Vertex is the richer default
      moderationProvider: OpenAiModerationProvider,
      ...getGoogleAiStudioProviders(env),
    };
  } else if (useGoogleVertexDefaults) {
    logger.debug('Using Google Vertex default providers');
    providers = {
      moderationProvider: OpenAiModerationProvider,
      ...getGoogleVertexProviders(env),
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
  } else if (useXAIDefaults) {
    logger.debug('Using xAI default providers');
    providers = {
      embeddingProvider: OpenAiEmbeddingProvider, // xAI doesn't expose an embeddings API
      moderationProvider: OpenAiModerationProvider, // xAI doesn't expose a moderation API
      ...getXAIProviders(env),
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

export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  return resolveDefaultProviders(env);
}

function getProviderId(provider: ApiProvider | undefined): string | undefined {
  if (!provider) {
    return undefined;
  }

  try {
    return provider.id();
  } catch {
    return undefined;
  }
}

function getDefaultProviderSelection(
  preferences: DefaultProviderPreferences,
): Pick<DefaultProviderSelectionInfo, 'selectedProvider' | 'reason'> {
  if (preferences.preferAzure) {
    return {
      selectedProvider: 'Azure OpenAI',
      reason: 'Azure credentials and deployment name found, OPENAI_API_KEY not set',
    };
  }

  if (preferences.preferAnthropic) {
    return {
      selectedProvider: 'Anthropic',
      reason: 'ANTHROPIC_API_KEY found, OPENAI_API_KEY not set',
    };
  }

  if (preferences.useGoogleAiStudioDefaults) {
    const credential = preferences.hasGeminiApiKey
      ? 'GEMINI_API_KEY'
      : preferences.hasGoogleApiKey
        ? 'GOOGLE_API_KEY'
        : 'PALM_API_KEY';
    return {
      selectedProvider: 'Google AI Studio',
      reason: `${credential} found, OPENAI_API_KEY and ANTHROPIC_API_KEY not set`,
    };
  }

  if (preferences.useGoogleVertexDefaults) {
    return {
      selectedProvider: 'Google Vertex',
      reason:
        'Google Application Default Credentials found, no API keys for OpenAI/Anthropic/Google AI Studio',
    };
  }

  if (preferences.useMistralDefaults) {
    return {
      selectedProvider: 'Mistral',
      reason: 'MISTRAL_API_KEY found, no credentials for higher-priority providers',
    };
  }

  if (preferences.useXAIDefaults) {
    return {
      selectedProvider: 'xAI',
      reason: 'XAI_API_KEY found, no credentials for higher-priority providers',
    };
  }

  if (preferences.useCodexDefaults) {
    return {
      selectedProvider: 'Codex SDK',
      reason: 'ChatGPT/Codex credentials found, no credentials for higher-priority providers',
    };
  }

  if (preferences.useGitHubDefaults) {
    return {
      selectedProvider: 'GitHub Models',
      reason: 'GITHUB_TOKEN found, no credentials for higher-priority providers',
    };
  }

  return {
    selectedProvider: 'OpenAI',
    reason: preferences.hasOpenAiCredentials
      ? 'OPENAI_API_KEY found (highest priority)'
      : 'Default provider (no other credentials detected)',
  };
}

function getSkippedProviders({
  preferences,
  selectedProvider,
}: {
  preferences: DefaultProviderPreferences;
  selectedProvider: string;
}): SkippedProviderInfo[] {
  const skippedProviders: SkippedProviderInfo[] = [];
  const addSkippedProvider = (name: string, credentialPresent: boolean, reason: string) => {
    if (credentialPresent) {
      skippedProviders.push({ name, reason });
    }
  };

  switch (selectedProvider) {
    case 'Azure OpenAI':
      addSkippedProvider(
        'Anthropic',
        preferences.hasAnthropicCredentials,
        'Azure has higher priority when OPENAI_API_KEY is not set',
      );
      addSkippedProvider(
        'Google AI Studio',
        preferences.hasGoogleAiStudioCredentials,
        'Azure has higher priority',
      );
      addSkippedProvider('Mistral', preferences.hasMistralCredentials, 'Azure has higher priority');
      addSkippedProvider('xAI', preferences.hasXAICredentials, 'Azure has higher priority');
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Azure has higher priority',
      );
      break;
    case 'Anthropic':
      addSkippedProvider(
        'Google AI Studio',
        preferences.hasGoogleAiStudioCredentials,
        'Anthropic has higher priority',
      );
      addSkippedProvider(
        'Mistral',
        preferences.hasMistralCredentials,
        'Anthropic has higher priority',
      );
      addSkippedProvider('xAI', preferences.hasXAICredentials, 'Anthropic has higher priority');
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Anthropic has higher priority',
      );
      break;
    case 'Google AI Studio':
      addSkippedProvider(
        'Mistral',
        preferences.hasMistralCredentials,
        'Google AI Studio has higher priority',
      );
      addSkippedProvider(
        'xAI',
        preferences.hasXAICredentials,
        'Google AI Studio has higher priority',
      );
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Google AI Studio has higher priority',
      );
      break;
    case 'Google Vertex':
      addSkippedProvider(
        'Mistral',
        preferences.hasMistralCredentials,
        'Google Vertex has higher priority',
      );
      addSkippedProvider('xAI', preferences.hasXAICredentials, 'Google Vertex has higher priority');
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Google Vertex has higher priority',
      );
      break;
    case 'Mistral':
      addSkippedProvider('xAI', preferences.hasXAICredentials, 'Mistral has higher priority');
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Mistral has higher priority',
      );
      break;
    case 'xAI':
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'xAI has higher priority',
      );
      break;
    case 'Codex SDK':
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'Codex SDK has higher priority',
      );
      break;
    case 'OpenAI':
      addSkippedProvider(
        'Azure OpenAI',
        (preferences.hasAzureApiKey ||
          preferences.hasAzureOpenAiApiKey ||
          preferences.hasAzureClientCreds) &&
          preferences.hasAzureDeploymentName,
        'OpenAI has higher priority',
      );
      addSkippedProvider(
        'Anthropic',
        preferences.hasAnthropicCredentials,
        'OpenAI has higher priority when OPENAI_API_KEY is set',
      );
      addSkippedProvider(
        'Google AI Studio',
        preferences.hasGoogleAiStudioCredentials,
        'OpenAI has higher priority',
      );
      addSkippedProvider(
        'Mistral',
        preferences.hasMistralCredentials,
        'OpenAI has higher priority',
      );
      addSkippedProvider('xAI', preferences.hasXAICredentials, 'OpenAI has higher priority');
      addSkippedProvider(
        'GitHub Models',
        preferences.hasGitHubCredentials,
        'OpenAI has higher priority',
      );
      break;
  }

  return skippedProviders;
}

function getDefaultProviderSlots({
  env,
  preferences,
  selectedProvider,
}: {
  env?: EnvOverrides;
  preferences: DefaultProviderPreferences;
  selectedProvider: string;
}): DefaultProviderSelectionInfo['providerSlots'] {
  const selectedProviderSlots = (() => {
    switch (selectedProvider) {
      case 'Azure OpenAI':
        return getAzureProviderSlots(env, selectedProvider);
      case 'Anthropic':
        return getAnthropicProviderSlots(selectedProvider);
      case 'Google AI Studio':
        return getGoogleAiStudioProviderSlots();
      case 'Google Vertex':
        return getGoogleVertexProviderSlots();
      case 'Mistral':
        return getMistralProviderSlots(selectedProvider);
      case 'xAI':
        return getXAIProviderSlots(selectedProvider);
      case 'Codex SDK':
        return getCodexProviderSlots(selectedProvider);
      case 'GitHub Models':
        return getGitHubProviderSlots(selectedProvider);
      default:
        return getOpenAIProviderSlots(selectedProvider);
    }
  })();

  if (preferences.hasAzureContentSafety) {
    selectedProviderSlots.moderation = { id: 'Azure Content Safety' };
  }

  if (defaultCompletionProvider) {
    const completionOverride = {
      id: getProviderId(defaultCompletionProvider) || 'Custom provider',
    };
    selectedProviderSlots.grading = completionOverride;
    selectedProviderSlots.gradingJson = completionOverride;
    selectedProviderSlots.llmRubric = completionOverride;
    selectedProviderSlots.suggestions = completionOverride;
    selectedProviderSlots.synthesize = completionOverride;
  }

  if (defaultEmbeddingProvider) {
    selectedProviderSlots.embedding = {
      id: getProviderId(defaultEmbeddingProvider) || 'Custom provider',
    };
  }

  return selectedProviderSlots;
}

function getAzureProviderSlots(
  env: EnvOverrides | undefined,
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  const deploymentName = getAzureDeploymentName(env);
  const embeddingDeploymentName =
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
    deploymentName;
  const azureSlot = deploymentName ? { id: `azure:${deploymentName}` } : undefined;

  return {
    embedding: embeddingDeploymentName ? { id: `azure:${embeddingDeploymentName}` } : undefined,
    grading: azureSlot,
    gradingJson: azureSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: azureSlot,
    synthesize: azureSlot,
  };
}

function getAnthropicProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  const anthropicSlot = {
    id: `anthropic:${DEFAULT_ANTHROPIC_MODEL}`,
    model: DEFAULT_ANTHROPIC_MODEL,
  };

  return {
    embedding: { id: getProviderId(OpenAiEmbeddingProvider) || selectedProvider },
    grading: anthropicSlot,
    gradingJson: anthropicSlot,
    llmRubric: anthropicSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: anthropicSlot,
    synthesize: anthropicSlot,
    webSearch: anthropicSlot,
  };
}

function getGoogleAiStudioProviderSlots(): DefaultProviderSelectionInfo['providerSlots'] {
  const aiStudioSlot = { id: `google:${DEFAULT_AI_STUDIO_MODEL}` };

  return {
    embedding: { id: `vertex:${DEFAULT_VERTEX_EMBEDDING_MODEL}` },
    grading: aiStudioSlot,
    gradingJson: aiStudioSlot,
    llmRubric: aiStudioSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || 'OpenAI' },
    suggestions: aiStudioSlot,
    synthesize: aiStudioSlot,
  };
}

function getGoogleVertexProviderSlots(): DefaultProviderSelectionInfo['providerSlots'] {
  const vertexSlot = { id: `vertex:${DEFAULT_VERTEX_MODEL}` };

  return {
    embedding: { id: `vertex:${DEFAULT_VERTEX_EMBEDDING_MODEL}` },
    grading: vertexSlot,
    gradingJson: vertexSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || 'OpenAI' },
    suggestions: vertexSlot,
    synthesize: vertexSlot,
  };
}

function getMistralProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  return {
    embedding: { id: getProviderId(MistralEmbeddingProvider) || selectedProvider },
    grading: { id: getProviderId(MistralGradingProvider) || selectedProvider },
    gradingJson: { id: getProviderId(MistralGradingJsonProvider) || selectedProvider },
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: { id: getProviderId(MistralSuggestionsProvider) || selectedProvider },
    synthesize: { id: getProviderId(MistralSynthesizeProvider) || selectedProvider },
  };
}

function getXAIProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  const xaiSlot = { id: `xai:${DEFAULT_XAI_MODEL}` };

  return {
    embedding: { id: getProviderId(OpenAiEmbeddingProvider) || selectedProvider },
    grading: xaiSlot,
    gradingJson: xaiSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: xaiSlot,
    synthesize: xaiSlot,
    webSearch: { id: `xai:responses:${DEFAULT_XAI_MODEL}` },
  };
}

function getCodexProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  const codexSlot = { id: 'openai:codex-sdk' };

  return {
    embedding: { id: getProviderId(OpenAiEmbeddingProvider) || selectedProvider },
    grading: codexSlot,
    gradingJson: codexSlot,
    llmRubric: codexSlot,
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: codexSlot,
    synthesize: codexSlot,
    webSearch: codexSlot,
  };
}

function getGitHubProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  return {
    embedding: { id: getProviderId(OpenAiEmbeddingProvider) || selectedProvider },
    grading: { id: getProviderId(DefaultGitHubGradingProvider) || selectedProvider },
    gradingJson: { id: getProviderId(DefaultGitHubGradingJsonProvider) || selectedProvider },
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: { id: getProviderId(DefaultGitHubSuggestionsProvider) || selectedProvider },
    synthesize: { id: getProviderId(DefaultGitHubGradingJsonProvider) || selectedProvider },
  };
}

function getOpenAIProviderSlots(
  selectedProvider: string,
): DefaultProviderSelectionInfo['providerSlots'] {
  return {
    embedding: { id: getProviderId(OpenAiEmbeddingProvider) || selectedProvider },
    grading: { id: getProviderId(OpenAiGradingProvider) || selectedProvider },
    gradingJson: { id: getProviderId(OpenAiGradingJsonProvider) || selectedProvider },
    moderation: { id: getProviderId(OpenAiModerationProvider) || selectedProvider },
    suggestions: { id: getProviderId(OpenAiSuggestionsProvider) || selectedProvider },
    synthesize: { id: getProviderId(OpenAiGradingJsonProvider) || selectedProvider },
    webSearch: { id: getProviderId(OpenAiWebSearchProvider) || selectedProvider },
  };
}

function buildDefaultProviderSelectionInfo({
  env,
  preferences,
}: {
  env?: EnvOverrides;
  preferences: DefaultProviderPreferences;
}): DefaultProviderSelectionInfo {
  const { selectedProvider, reason: selectionReason } = getDefaultProviderSelection(preferences);
  let reason = selectionReason;
  const completionOverrideId = getProviderId(defaultCompletionProvider);
  const embeddingOverrideId = getProviderId(defaultEmbeddingProvider);

  if (defaultCompletionProvider || defaultEmbeddingProvider) {
    const overrides = [
      defaultCompletionProvider
        ? completionOverrideId
          ? `completion provider overridden to ${completionOverrideId}`
          : 'completion provider overridden'
        : undefined,
      defaultEmbeddingProvider
        ? embeddingOverrideId
          ? `embedding provider overridden to ${embeddingOverrideId}`
          : 'embedding provider overridden'
        : undefined,
    ].filter((override): override is string => override != null);
    reason = `${reason}; ${overrides.join(', ')}`;
  }

  return {
    selectedProvider,
    reason,
    detectedCredentials: preferences.detectedCredentials,
    skippedProviders: getSkippedProviders({ preferences, selectedProvider }),
    providerSlots: getDefaultProviderSlots({ env, preferences, selectedProvider }),
  };
}

export async function getDefaultProviderSelectionInfo(
  env?: EnvOverrides,
): Promise<DefaultProviderSelectionInfo> {
  const preferences = await getDefaultProviderPreferences(env);
  return buildDefaultProviderSelectionInfo({ env, preferences });
}

export async function getDefaultProvidersWithInfo(
  env?: EnvOverrides,
): Promise<DefaultProvidersWithInfo> {
  const preferences = await getDefaultProviderPreferences(env);
  const providers = await resolveDefaultProviders(env, preferences);
  return {
    providers,
    selectionInfo: buildDefaultProviderSelectionInfo({ env, preferences }),
  };
}
