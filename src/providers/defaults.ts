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
import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultModerationProvider as OpenAiModerationProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
  DefaultWebSearchProvider as OpenAiWebSearchProvider,
} from './openai/defaults';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  DefaultProviderSelectionInfo,
  DefaultProviders,
  DefaultProvidersWithInfo,
  SkippedProviderInfo,
} from '../types/index';

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

/**
 * Helper to get provider ID safely
 */
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

/**
 * Gets the default providers along with metadata about how they were selected.
 * This provides visibility into the auto-detection logic for debugging and user information.
 *
 * @param env - Optional environment overrides
 * @returns Default providers and selection metadata
 */
export async function getDefaultProvidersWithInfo(
  env?: EnvOverrides,
): Promise<DefaultProvidersWithInfo> {
  const detectedCredentials: string[] = [];
  const skippedProviders: SkippedProviderInfo[] = [];

  // Check for provider credentials and build detected list
  const hasOpenAiCredentials = Boolean(getEnvString('OPENAI_API_KEY') || env?.OPENAI_API_KEY);
  if (hasOpenAiCredentials) {
    detectedCredentials.push('OPENAI_API_KEY');
  }

  const hasAnthropicCredentials = Boolean(
    getEnvString('ANTHROPIC_API_KEY') || env?.ANTHROPIC_API_KEY,
  );
  if (hasAnthropicCredentials) {
    detectedCredentials.push('ANTHROPIC_API_KEY');
  }

  const hasGitHubCredentials = Boolean(getEnvString('GITHUB_TOKEN') || env?.GITHUB_TOKEN);
  if (hasGitHubCredentials) {
    detectedCredentials.push('GITHUB_TOKEN');
  }

  const hasGeminiApiKey = Boolean(getEnvString('GEMINI_API_KEY') || env?.GEMINI_API_KEY);
  if (hasGeminiApiKey) {
    detectedCredentials.push('GEMINI_API_KEY');
  }

  const hasGoogleApiKey = Boolean(getEnvString('GOOGLE_API_KEY') || env?.GOOGLE_API_KEY);
  if (hasGoogleApiKey) {
    detectedCredentials.push('GOOGLE_API_KEY');
  }

  const hasPalmApiKey = Boolean(getEnvString('PALM_API_KEY') || env?.PALM_API_KEY);
  if (hasPalmApiKey) {
    detectedCredentials.push('PALM_API_KEY');
  }

  const hasGoogleAiStudioCredentials = hasGeminiApiKey || hasGoogleApiKey || hasPalmApiKey;

  const hasMistralCredentials = Boolean(getEnvString('MISTRAL_API_KEY') || env?.MISTRAL_API_KEY);
  if (hasMistralCredentials) {
    detectedCredentials.push('MISTRAL_API_KEY');
  }

  const hasAzureApiKey = Boolean(
    getEnvString('AZURE_OPENAI_API_KEY') ||
      env?.AZURE_OPENAI_API_KEY ||
      getEnvString('AZURE_API_KEY') ||
      env?.AZURE_API_KEY,
  );
  if (hasAzureApiKey) {
    detectedCredentials.push('AZURE_OPENAI_API_KEY');
  }

  const hasAzureClientCreds = Boolean(
    (getEnvString('AZURE_CLIENT_ID') || env?.AZURE_CLIENT_ID) &&
      (getEnvString('AZURE_CLIENT_SECRET') || env?.AZURE_CLIENT_SECRET) &&
      (getEnvString('AZURE_TENANT_ID') || env?.AZURE_TENANT_ID),
  );
  if (hasAzureClientCreds) {
    detectedCredentials.push('AZURE_CLIENT_CREDENTIALS');
  }

  const hasAzureDeploymentName = Boolean(
    (getEnvString('AZURE_DEPLOYMENT_NAME') || env?.AZURE_DEPLOYMENT_NAME) &&
      (getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME),
  );

  const hasAzureContentSafety = Boolean(
    getEnvString('AZURE_CONTENT_SAFETY_ENDPOINT') || env?.AZURE_CONTENT_SAFETY_ENDPOINT,
  );
  if (hasAzureContentSafety) {
    detectedCredentials.push('AZURE_CONTENT_SAFETY_ENDPOINT');
  }

  // Determine which provider to use with priority tracking
  const preferAzure =
    !hasOpenAiCredentials && (hasAzureApiKey || hasAzureClientCreds) && hasAzureDeploymentName;

  const preferAnthropic = !hasOpenAiCredentials && hasAnthropicCredentials;

  // Only check Google ADC when it could actually affect provider selection.
  // ADC lookup involves metadata/file probing which can add latency or hang in some environments.
  // We only need to check ADC if:
  // 1. No higher-priority credentials are set (OpenAI, Anthropic, Azure, Google AI Studio API keys)
  // 2. OR we want to report it in detectedCredentials for the "skipped" list
  const shouldCheckGoogleADC =
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !preferAzure &&
    !hasGoogleAiStudioCredentials;

  let hasGoogleADC = false;
  if (shouldCheckGoogleADC) {
    hasGoogleADC = await hasGoogleDefaultCredentials();
    if (hasGoogleADC) {
      detectedCredentials.push('GOOGLE_APPLICATION_CREDENTIALS');
    }
  }

  let providers: Pick<DefaultProviders, keyof DefaultProviders>;
  let selectedProvider: string;
  let reason: string;

  if (preferAzure) {
    selectedProvider = 'Azure OpenAI';
    reason = 'Azure credentials and deployment name found, OPENAI_API_KEY not set';
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
    const azureEmbeddingProvider = new AzureEmbeddingProvider(embeddingDeploymentName, { env });

    providers = {
      embeddingProvider: azureEmbeddingProvider,
      gradingJsonProvider: azureProvider,
      gradingProvider: azureProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: azureProvider,
      synthesizeProvider: azureProvider,
    };

    // Track skipped providers
    // Note: We don't check Google ADC here because ADC lookup is expensive and
    // we've already determined Azure will be used.
    if (hasAnthropicCredentials) {
      skippedProviders.push({
        name: 'Anthropic',
        reason: 'Azure has higher priority when OPENAI_API_KEY not set',
      });
    }
    if (hasGoogleAiStudioCredentials) {
      skippedProviders.push({
        name: 'Google AI Studio',
        reason: 'Azure has higher priority',
      });
    }
    if (hasMistralCredentials) {
      skippedProviders.push({
        name: 'Mistral',
        reason: 'Azure has higher priority',
      });
    }
    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'Azure has higher priority',
      });
    }
  } else if (preferAnthropic) {
    selectedProvider = 'Anthropic';
    reason = 'ANTHROPIC_API_KEY found, OPENAI_API_KEY not set';
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

    // Track skipped providers
    // Note: We don't check Google ADC here because ADC lookup is expensive and
    // we've already determined Anthropic will be used.
    if (hasGoogleAiStudioCredentials) {
      skippedProviders.push({
        name: 'Google AI Studio',
        reason: 'Anthropic has higher priority',
      });
    }
    if (hasMistralCredentials) {
      skippedProviders.push({
        name: 'Mistral',
        reason: 'Anthropic has higher priority',
      });
    }
    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'Anthropic has higher priority',
      });
    }
  } else if (!hasOpenAiCredentials && !hasAnthropicCredentials && hasGoogleAiStudioCredentials) {
    selectedProvider = 'Google AI Studio';
    const credKey = hasGeminiApiKey
      ? 'GEMINI_API_KEY'
      : hasGoogleApiKey
        ? 'GOOGLE_API_KEY'
        : 'PALM_API_KEY';
    reason = `${credKey} found, OPENAI_API_KEY and ANTHROPIC_API_KEY not set`;
    logger.debug('Using Google AI Studio default providers');

    providers = {
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GoogleAiStudioGradingJsonProvider,
      gradingProvider: GoogleAiStudioGradingProvider,
      llmRubricProvider: GoogleAiStudioLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GoogleAiStudioSuggestionsProvider,
      synthesizeProvider: GoogleAiStudioSynthesizeProvider,
    };

    if (hasGoogleADC) {
      skippedProviders.push({
        name: 'Google Vertex',
        reason: 'Google AI Studio API key takes priority over ADC',
      });
    }
    if (hasMistralCredentials) {
      skippedProviders.push({
        name: 'Mistral',
        reason: 'Google AI Studio has higher priority',
      });
    }
    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'Google AI Studio has higher priority',
      });
    }
  } else if (
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials &&
    hasGoogleADC
  ) {
    selectedProvider = 'Google Vertex';
    reason =
      'Google Application Default Credentials found, no API keys for OpenAI/Anthropic/Google AI Studio';
    logger.debug('Using Google Vertex default providers');

    providers = {
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      gradingProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GeminiGradingProvider,
      synthesizeProvider: GeminiGradingProvider,
    };

    if (hasMistralCredentials) {
      skippedProviders.push({
        name: 'Mistral',
        reason: 'Google Vertex has higher priority',
      });
    }
    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'Google Vertex has higher priority',
      });
    }
  } else if (
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials &&
    !hasGoogleADC &&
    hasMistralCredentials
  ) {
    selectedProvider = 'Mistral';
    reason = 'MISTRAL_API_KEY found, no credentials for higher-priority providers';
    logger.debug('Using Mistral default providers');

    providers = {
      embeddingProvider: MistralEmbeddingProvider,
      gradingJsonProvider: MistralGradingJsonProvider,
      gradingProvider: MistralGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: MistralSuggestionsProvider,
      synthesizeProvider: MistralSynthesizeProvider,
    };

    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'Mistral has higher priority',
      });
    }
  } else if (
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials &&
    !hasGoogleADC &&
    !hasMistralCredentials &&
    hasGitHubCredentials
  ) {
    selectedProvider = 'GitHub Models';
    reason = 'GITHUB_TOKEN found, no credentials for higher-priority providers';
    logger.debug('Using GitHub Models default providers');

    providers = {
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingJsonProvider: DefaultGitHubGradingJsonProvider,
      gradingProvider: DefaultGitHubGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: DefaultGitHubSuggestionsProvider,
      synthesizeProvider: DefaultGitHubGradingJsonProvider,
    };
  } else {
    selectedProvider = 'OpenAI';
    reason = hasOpenAiCredentials
      ? 'OPENAI_API_KEY found (highest priority)'
      : 'Default provider (no other credentials detected)';
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

    // Track skipped providers (OpenAI wins because it has the key)
    // Note: We don't check Google ADC here because ADC lookup is expensive and
    // we've already determined OpenAI will be used. Users with OpenAI keys
    // typically don't need to know about Google ADC availability.
    if (hasAnthropicCredentials) {
      skippedProviders.push({
        name: 'Anthropic',
        reason: 'OpenAI has higher priority when OPENAI_API_KEY is set',
      });
    }
    if (hasGoogleAiStudioCredentials) {
      skippedProviders.push({
        name: 'Google AI Studio',
        reason: 'OpenAI has higher priority',
      });
    }
    if (hasMistralCredentials) {
      skippedProviders.push({
        name: 'Mistral',
        reason: 'OpenAI has higher priority',
      });
    }
    if (hasGitHubCredentials) {
      skippedProviders.push({
        name: 'GitHub Models',
        reason: 'OpenAI has higher priority',
      });
    }
  }

  // Handle Azure Content Safety moderation override
  let moderationOverride: string | undefined;
  if (hasAzureContentSafety) {
    providers.moderationProvider = new AzureModerationProvider('text-content-safety', { env });
    moderationOverride = 'Azure Content Safety';
  }

  // Handle default provider overrides
  let completionOverride: string | undefined;
  if (defaultCompletionProvider) {
    logger.debug(`Overriding default completion provider: ${defaultCompletionProvider.id()}`);
    completionOverride = defaultCompletionProvider.id();
    COMPLETION_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultCompletionProvider;
    });
  }

  let embeddingOverride: string | undefined;
  if (defaultEmbeddingProvider) {
    embeddingOverride = defaultEmbeddingProvider.id();
    EMBEDDING_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultEmbeddingProvider;
    });
  }

  // Update reason if there are overrides
  if (completionOverride || embeddingOverride) {
    const overrides: string[] = [];
    if (completionOverride) {
      overrides.push(`completion provider overridden to ${completionOverride}`);
    }
    if (embeddingOverride) {
      overrides.push(`embedding provider overridden to ${embeddingOverride}`);
    }
    reason = `${reason}; ${overrides.join(', ')}`;
  }

  // Build provider slot info
  const selectionInfo: DefaultProviderSelectionInfo = {
    selectedProvider,
    reason,
    detectedCredentials,
    skippedProviders,
    providerSlots: {
      grading: providers.gradingProvider
        ? { id: getProviderId(providers.gradingProvider) || selectedProvider }
        : undefined,
      gradingJson: providers.gradingJsonProvider
        ? { id: getProviderId(providers.gradingJsonProvider) || selectedProvider }
        : undefined,
      embedding: providers.embeddingProvider
        ? { id: getProviderId(providers.embeddingProvider) || 'openai:embedding' }
        : undefined,
      moderation: providers.moderationProvider
        ? {
            id: moderationOverride || getProviderId(providers.moderationProvider) || 'openai',
          }
        : undefined,
      suggestions: providers.suggestionsProvider
        ? { id: getProviderId(providers.suggestionsProvider) || selectedProvider }
        : undefined,
      synthesize: providers.synthesizeProvider
        ? { id: getProviderId(providers.synthesizeProvider) || selectedProvider }
        : undefined,
      llmRubric: providers.llmRubricProvider
        ? { id: getProviderId(providers.llmRubricProvider) || selectedProvider }
        : undefined,
      webSearch: providers.webSearchProvider
        ? { id: getProviderId(providers.webSearchProvider) || selectedProvider }
        : undefined,
    },
  };

  // Add model information for Anthropic
  if (selectedProvider === 'Anthropic') {
    if (selectionInfo.providerSlots.grading) {
      selectionInfo.providerSlots.grading.model = DEFAULT_ANTHROPIC_MODEL;
    }
    if (selectionInfo.providerSlots.gradingJson) {
      selectionInfo.providerSlots.gradingJson.model = DEFAULT_ANTHROPIC_MODEL;
    }
    if (selectionInfo.providerSlots.suggestions) {
      selectionInfo.providerSlots.suggestions.model = DEFAULT_ANTHROPIC_MODEL;
    }
    if (selectionInfo.providerSlots.synthesize) {
      selectionInfo.providerSlots.synthesize.model = DEFAULT_ANTHROPIC_MODEL;
    }
    if (selectionInfo.providerSlots.llmRubric) {
      selectionInfo.providerSlots.llmRubric.model = DEFAULT_ANTHROPIC_MODEL;
    }
    if (selectionInfo.providerSlots.webSearch) {
      selectionInfo.providerSlots.webSearch.model = DEFAULT_ANTHROPIC_MODEL;
    }
  }

  return {
    providers,
    selectionInfo,
  };
}

/**
 * Gets the default providers for grading, embedding, moderation, etc.
 * This is the original function signature maintained for backward compatibility.
 *
 * @param env - Optional environment overrides
 * @returns Default provider instances
 */
export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  const { providers } = await getDefaultProvidersWithInfo(env);
  return providers;
}
