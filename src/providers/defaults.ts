import { getEnvString } from '../envars';
import logger from '../logger';
import { getAnthropicProviders } from './anthropic/defaults';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureModerationProvider } from './azure/moderation';
import {
  DefaultGradingProvider as BedrockGradingProvider,
  DefaultGradingJsonProvider as BedrockGradingJsonProvider,
  DefaultSuggestionsProvider as BedrockSuggestionsProvider,
  DefaultSynthesizeProvider as BedrockSynthesizeProvider,
} from './bedrock/defaults';
import {
  DefaultGradingProvider as DeepSeekGradingProvider,
  DefaultGradingJsonProvider as DeepSeekGradingJsonProvider,
  DefaultSuggestionsProvider as DeepSeekSuggestionsProvider,
  DefaultSynthesizeProvider as DeepSeekSynthesizeProvider,
} from './deepseek/defaults';
import {
  DefaultGitHubGradingProvider as GitHubGradingProvider,
  DefaultGitHubGradingJsonProvider as GitHubGradingJsonProvider,
  DefaultGitHubSuggestionsProvider as GitHubSuggestionsProvider,
} from './github/defaults';
import {
  DefaultGradingProvider as GoogleAiStudioGradingProvider,
  DefaultGradingJsonProvider as GoogleAiStudioGradingJsonProvider,
  DefaultLlmRubricProvider as GoogleAiStudioLlmRubricProvider,
  DefaultSuggestionsProvider as GoogleAiStudioSuggestionsProvider,
  DefaultSynthesizeProvider as GoogleAiStudioSynthesizeProvider,
} from './google/ai.studio';
import { hasGoogleDefaultCredentials } from './google/util';
import {
  DefaultEmbeddingProvider as VertexEmbeddingProvider,
  DefaultGradingProvider as VertexGradingProvider,
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
import { VoyageEmbeddingProvider } from './voyage';
import {
  DefaultGradingProvider as XAIGradingProvider,
  DefaultGradingJsonProvider as XAIGradingJsonProvider,
  DefaultSuggestionsProvider as XAISuggestionsProvider,
  DefaultSynthesizeProvider as XAISynthesizeProvider,
} from './xai/defaults';

import type { ApiProvider, DefaultProviders } from '../types/index';
import type { EnvOverrides } from '../types/env';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a standardized completion provider set.
 * Most providers only need to specify their grading provider - everything else
 * falls back to sensible defaults.
 * Note: Embedding is NOT included - it's selected independently.
 */
interface CompletionProviderSetOptions {
  grading: ApiProvider;
  gradingJson?: ApiProvider;
  suggestions?: ApiProvider;
  /** Falls back to gradingJson, then grading if not specified */
  synthesize?: ApiProvider;
  llmRubric?: ApiProvider;
  webSearch?: ApiProvider;
}

/**
 * A provider candidate in the completion priority chain.
 * The check function determines if this provider should be used,
 * and the create function builds the provider set (without embedding - that's selected separately).
 */
interface CompletionProviderCandidate {
  /** Human-readable name for logging */
  name: string;
  /** Credential check - can be sync or async */
  check: (env?: EnvOverrides) => boolean | Promise<boolean>;
  /** Factory function to create the provider set */
  create: (env?: EnvOverrides) => Omit<DefaultProviders, 'embeddingProvider'>;
}

/**
 * An embedding provider candidate in the embedding priority chain.
 * Embedding selection is independent of completion provider selection.
 */
interface EmbeddingProviderCandidate {
  /** Human-readable name for logging */
  name: string;
  /** Credential check - can be sync or async */
  check: (env?: EnvOverrides) => boolean | Promise<boolean>;
  /** Factory function to create the embedding provider */
  create: (env?: EnvOverrides) => ApiProvider;
}

// =============================================================================
// Constants
// =============================================================================

const COMPLETION_PROVIDER_KEYS: (keyof DefaultProviders)[] = [
  'gradingJsonProvider',
  'gradingProvider',
  'llmRubricProvider',
  'suggestionsProvider',
  'synthesizeProvider',
];

const EMBEDDING_PROVIDER_KEYS: (keyof DefaultProviders)[] = ['embeddingProvider'];

// =============================================================================
// Module State (for global overrides)
// =============================================================================

let overrideCompletionProvider: ApiProvider | undefined;
let overrideEmbeddingProvider: ApiProvider | undefined;

// =============================================================================
// Credential Helpers
// =============================================================================

/**
 * Check if a credential is available in environment or overrides.
 */
function hasCredential(envKey: keyof EnvOverrides, env?: EnvOverrides): boolean {
  return Boolean(getEnvString(envKey) || env?.[envKey]);
}

/**
 * Check if any of the given credentials are available.
 */
function hasAnyCredential(envKeys: (keyof EnvOverrides)[], env?: EnvOverrides): boolean {
  return envKeys.some((key) => hasCredential(key, env));
}

/**
 * Check for Azure OpenAI credentials (API key OR client credentials) AND deployment name.
 * Accepts either AZURE_OPENAI_DEPLOYMENT_NAME or AZURE_DEPLOYMENT_NAME per documentation.
 */
function hasAzureCredentials(env?: EnvOverrides): boolean {
  const hasApiKey = hasAnyCredential(['AZURE_OPENAI_API_KEY', 'AZURE_API_KEY'], env);
  const hasClientCreds =
    hasCredential('AZURE_CLIENT_ID', env) &&
    hasCredential('AZURE_CLIENT_SECRET', env) &&
    hasCredential('AZURE_TENANT_ID', env);
  const hasDeployment = hasAnyCredential(
    ['AZURE_OPENAI_DEPLOYMENT_NAME', 'AZURE_DEPLOYMENT_NAME'],
    env,
  );

  return (hasApiKey || hasClientCreds) && hasDeployment;
}

// =============================================================================
// Provider Set Factory
// =============================================================================

/**
 * Create a standardized completion provider set with sensible defaults.
 * Note: Embedding provider is NOT included - it's selected independently.
 *
 * Fallback chain for synthesizeProvider:
 *   synthesize ?? gradingJson ?? grading
 *
 * This is because synthesize operations typically need JSON output capability,
 * so gradingJson is preferred over plain grading when synthesize isn't specified.
 */
function createCompletionProviderSet(
  options: CompletionProviderSetOptions,
): Omit<DefaultProviders, 'embeddingProvider'> {
  return {
    gradingProvider: options.grading,
    gradingJsonProvider: options.gradingJson ?? options.grading,
    suggestionsProvider: options.suggestions ?? options.grading,
    synthesizeProvider: options.synthesize ?? options.gradingJson ?? options.grading,
    llmRubricProvider: options.llmRubric,
    moderationProvider: OpenAiModerationProvider,
    webSearchProvider: options.webSearch,
  };
}

/**
 * Create OpenAI completion provider set.
 * Note: Embedding is selected independently via EMBEDDING_PROVIDER_PRIORITY.
 */
function createOpenAICompletionProviders(): Omit<DefaultProviders, 'embeddingProvider'> {
  return createCompletionProviderSet({
    grading: OpenAiGradingProvider,
    gradingJson: OpenAiGradingJsonProvider,
    suggestions: OpenAiSuggestionsProvider,
    webSearch: OpenAiWebSearchProvider,
  });
}

/**
 * Create Azure-specific completion providers (requires dynamic deployment name lookup).
 * Note: Azure uses the same provider for all completion tasks since it's deployment-based.
 * Note: Embedding is selected independently via EMBEDDING_PROVIDER_PRIORITY.
 * Supports both AZURE_OPENAI_DEPLOYMENT_NAME and AZURE_DEPLOYMENT_NAME per documentation.
 */
function createAzureCompletionProviders(
  env?: EnvOverrides,
): Omit<DefaultProviders, 'embeddingProvider'> {
  const deploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_DEPLOYMENT_NAME ||
    getEnvString('AZURE_DEPLOYMENT_NAME') ||
    env?.AZURE_DEPLOYMENT_NAME;

  // deploymentName is guaranteed to exist because hasAzureCredentials checks for it
  const azureProvider = new AzureChatCompletionProvider(deploymentName!, { env });

  return createCompletionProviderSet({ grading: azureProvider });
}

/**
 * Create Azure embedding provider.
 * Used by the embedding priority chain when Azure credentials are available.
 */
function createAzureEmbeddingProvider(env?: EnvOverrides): ApiProvider {
  const deploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_DEPLOYMENT_NAME ||
    getEnvString('AZURE_DEPLOYMENT_NAME') ||
    env?.AZURE_DEPLOYMENT_NAME;
  const embeddingDeploymentName =
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
    deploymentName;

  return new AzureEmbeddingProvider(embeddingDeploymentName!, { env });
}

// =============================================================================
// Provider Priority Chains
// =============================================================================

/**
 * Completion provider selection priority chain.
 *
 * Order rationale:
 *   1-7: Explicit API keys (user intentionally set these)
 *   8-10: Ambient credentials (may exist for other purposes)
 *
 * Within explicit keys, ordered by popularity/capability.
 * Ambient credentials are last because they may be set for other tools
 * (e.g., GITHUB_TOKEN for git operations, AWS creds for other AWS services).
 */
const COMPLETION_PROVIDER_PRIORITY: CompletionProviderCandidate[] = [
  // --- Explicit API Keys (Priority 1-7) ---
  {
    name: 'OpenAI',
    check: (env) => hasCredential('OPENAI_API_KEY', env),
    create: () => createOpenAICompletionProviders(),
  },
  {
    name: 'Anthropic',
    check: (env) => hasCredential('ANTHROPIC_API_KEY', env),
    create: (env) => {
      const anthropic = getAnthropicProviders(env);
      return createCompletionProviderSet({
        grading: anthropic.gradingProvider,
        gradingJson: anthropic.gradingJsonProvider,
        suggestions: anthropic.suggestionsProvider,
        synthesize: anthropic.synthesizeProvider,
        llmRubric: anthropic.llmRubricProvider,
        webSearch: anthropic.webSearchProvider,
      });
    },
  },
  {
    name: 'Azure OpenAI',
    check: (env) => hasAzureCredentials(env),
    create: (env) => createAzureCompletionProviders(env),
  },
  {
    name: 'Google AI Studio',
    check: (env) => hasAnyCredential(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PALM_API_KEY'], env),
    create: () =>
      createCompletionProviderSet({
        grading: GoogleAiStudioGradingProvider,
        gradingJson: GoogleAiStudioGradingJsonProvider,
        suggestions: GoogleAiStudioSuggestionsProvider,
        synthesize: GoogleAiStudioSynthesizeProvider,
        llmRubric: GoogleAiStudioLlmRubricProvider,
      }),
  },
  {
    name: 'xAI',
    check: (env) => hasCredential('XAI_API_KEY', env),
    create: () =>
      createCompletionProviderSet({
        grading: XAIGradingProvider,
        gradingJson: XAIGradingJsonProvider,
        suggestions: XAISuggestionsProvider,
        synthesize: XAISynthesizeProvider,
      }),
  },
  {
    name: 'DeepSeek',
    check: (env) => hasCredential('DEEPSEEK_API_KEY', env),
    create: () =>
      createCompletionProviderSet({
        grading: DeepSeekGradingProvider,
        gradingJson: DeepSeekGradingJsonProvider,
        suggestions: DeepSeekSuggestionsProvider,
        synthesize: DeepSeekSynthesizeProvider,
      }),
  },
  {
    name: 'Mistral',
    check: (env) => hasCredential('MISTRAL_API_KEY', env),
    create: () =>
      createCompletionProviderSet({
        grading: MistralGradingProvider,
        gradingJson: MistralGradingJsonProvider,
        suggestions: MistralSuggestionsProvider,
        synthesize: MistralSynthesizeProvider,
      }),
  },

  // --- Ambient Credentials (Priority 8-10) ---
  {
    name: 'Google Vertex',
    check: () => hasGoogleDefaultCredentials(),
    create: () =>
      createCompletionProviderSet({
        grading: VertexGradingProvider,
      }),
  },
  {
    name: 'AWS Bedrock',
    check: (env) => hasAnyCredential(['AWS_ACCESS_KEY_ID', 'AWS_PROFILE'], env),
    create: () =>
      createCompletionProviderSet({
        grading: BedrockGradingProvider,
        gradingJson: BedrockGradingJsonProvider,
        suggestions: BedrockSuggestionsProvider,
        synthesize: BedrockSynthesizeProvider,
      }),
  },
  {
    name: 'GitHub Models',
    check: (env) => hasCredential('GITHUB_TOKEN', env),
    create: () =>
      createCompletionProviderSet({
        grading: GitHubGradingProvider,
        gradingJson: GitHubGradingJsonProvider,
        suggestions: GitHubSuggestionsProvider,
      }),
  },
];

/**
 * Embedding provider selection priority chain.
 * Selected INDEPENDENTLY from completion providers.
 *
 * Only includes providers that actually support embeddings.
 * Falls back to OpenAI if no embedding-capable provider is found.
 */
// Default Voyage embedding model - voyage-3.5 offers balanced performance
// Anthropic recommends Voyage for embeddings: https://docs.anthropic.com/en/docs/build-with-claude/embeddings
const VoyageDefaultEmbeddingProvider = new VoyageEmbeddingProvider('voyage-3.5');

const EMBEDDING_PROVIDER_PRIORITY: EmbeddingProviderCandidate[] = [
  {
    name: 'OpenAI',
    check: (env) => hasCredential('OPENAI_API_KEY', env),
    create: () => OpenAiEmbeddingProvider,
  },
  {
    name: 'Azure OpenAI',
    check: (env) => hasAzureCredentials(env),
    create: (env) => createAzureEmbeddingProvider(env),
  },
  {
    // Voyage AI - Anthropic's recommended embedding provider
    // Offers high-quality embeddings with domain-specific models available
    name: 'Voyage',
    check: (env) => hasCredential('VOYAGE_API_KEY', env),
    create: () => VoyageDefaultEmbeddingProvider,
  },
  {
    name: 'Mistral',
    check: (env) => hasCredential('MISTRAL_API_KEY', env),
    create: () => MistralEmbeddingProvider,
  },
  {
    name: 'Google Vertex',
    check: () => hasGoogleDefaultCredentials(),
    create: () => VertexEmbeddingProvider,
  },
  // Note: Anthropic, xAI, DeepSeek, Bedrock, GitHub don't support embeddings
];

// =============================================================================
// Public API
// =============================================================================

/**
 * Override all completion-type providers globally.
 * Useful for testing or forcing a specific provider.
 */
export function setDefaultCompletionProviders(provider: ApiProvider | undefined): void {
  overrideCompletionProvider = provider;
}

/**
 * Override embedding provider globally.
 */
export function setDefaultEmbeddingProviders(provider: ApiProvider | undefined): void {
  overrideEmbeddingProvider = provider;
}

/**
 * Get the default providers based on available credentials.
 *
 * Completion and embedding providers are selected INDEPENDENTLY:
 *
 * Completion Priority (explicit API keys first, then ambient):
 *  1. OpenAI      - OPENAI_API_KEY
 *  2. Anthropic   - ANTHROPIC_API_KEY
 *  3. Azure       - AZURE_OPENAI_API_KEY + deployment name
 *  4. Google AI   - GEMINI_API_KEY / GOOGLE_API_KEY / PALM_API_KEY
 *  5. xAI         - XAI_API_KEY
 *  6. DeepSeek    - DEEPSEEK_API_KEY
 *  7. Mistral     - MISTRAL_API_KEY
 *  8. Vertex      - Google ADC (ambient)
 *  9. Bedrock     - AWS credentials (ambient)
 * 10. GitHub      - GITHUB_TOKEN (ambient)
 * 11. OpenAI      - Fallback (may fail without key)
 *
 * Embedding Priority (only providers with embedding support):
 *  1. OpenAI      - OPENAI_API_KEY
 *  2. Azure       - AZURE_OPENAI_API_KEY + embedding deployment
 *  3. Voyage      - VOYAGE_API_KEY (Anthropic's recommended embedding provider)
 *  4. Mistral     - MISTRAL_API_KEY
 *  5. Vertex      - Google ADC (ambient)
 *  6. OpenAI      - Fallback (may fail without key)
 */
export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  // Select completion and embedding providers independently
  const completionProviders = await selectCompletionProviders(env);
  const embeddingProvider = await selectEmbeddingProvider(env);

  const providers: DefaultProviders = {
    ...completionProviders,
    embeddingProvider,
  };

  return applyOverrides(providers, env);
}

// =============================================================================
// Provider Selection Logic
// =============================================================================

/**
 * Select completion providers based on the first matching credentials.
 * Falls back to OpenAI if no credentials are found.
 */
async function selectCompletionProviders(
  env?: EnvOverrides,
): Promise<Omit<DefaultProviders, 'embeddingProvider'>> {
  for (const candidate of COMPLETION_PROVIDER_PRIORITY) {
    const hasCredentials = await candidate.check(env);
    if (hasCredentials) {
      logger.debug(`Using ${candidate.name} completion providers`);
      return candidate.create(env);
    }
  }

  // Fallback to OpenAI (may fail without key, but provides helpful error message)
  logger.debug('Using OpenAI completion providers (fallback)');
  return createOpenAICompletionProviders();
}

/**
 * Select embedding provider based on the first matching credentials.
 * Falls back to OpenAI if no embedding-capable provider is found.
 *
 * This is independent of completion provider selection because:
 * - Many providers (Anthropic, xAI, DeepSeek, etc.) don't support embeddings
 * - Users may want to use different providers for completions vs embeddings
 */
async function selectEmbeddingProvider(env?: EnvOverrides): Promise<ApiProvider> {
  for (const candidate of EMBEDDING_PROVIDER_PRIORITY) {
    const hasCredentials = await candidate.check(env);
    if (hasCredentials) {
      logger.debug(`Using ${candidate.name} embedding provider`);
      return candidate.create(env);
    }
  }

  // Fallback to OpenAI (may fail without key, but provides helpful error message)
  logger.debug('Using OpenAI embedding provider (fallback)');
  return OpenAiEmbeddingProvider;
}

// =============================================================================
// Override Application
// =============================================================================

/**
 * Apply global overrides and environment-specific customizations.
 */
function applyOverrides(providers: DefaultProviders, env?: EnvOverrides): DefaultProviders {
  // Azure Content Safety moderation override
  if (hasCredential('AZURE_CONTENT_SAFETY_ENDPOINT', env)) {
    providers.moderationProvider = new AzureModerationProvider('text-content-safety', { env });
  }

  // Global completion provider override
  if (overrideCompletionProvider) {
    logger.debug(`Overriding completion providers with: ${overrideCompletionProvider.id()}`);
    for (const key of COMPLETION_PROVIDER_KEYS) {
      providers[key] = overrideCompletionProvider;
    }
  }

  // Global embedding provider override
  if (overrideEmbeddingProvider) {
    for (const key of EMBEDDING_PROVIDER_KEYS) {
      providers[key] = overrideEmbeddingProvider;
    }
  }

  return providers;
}
