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
} from './openai/defaults';
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
 * Options for creating a standardized provider set.
 * Most providers only need to specify their grading provider - everything else
 * falls back to sensible defaults.
 */
interface ProviderSetOptions {
  grading: ApiProvider;
  gradingJson?: ApiProvider;
  suggestions?: ApiProvider;
  /** Falls back to gradingJson, then grading if not specified */
  synthesize?: ApiProvider;
  embedding?: ApiProvider;
  llmRubric?: ApiProvider;
}

/**
 * A provider candidate in the priority chain.
 * The check function determines if this provider should be used,
 * and the create function builds the provider set.
 */
interface ProviderCandidate {
  /** Human-readable name for logging */
  name: string;
  /** Credential check - can be sync or async */
  check: (env?: EnvOverrides) => boolean | Promise<boolean>;
  /** Factory function to create the provider set */
  create: (env?: EnvOverrides) => DefaultProviders;
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
 */
function hasAzureCredentials(env?: EnvOverrides): boolean {
  const hasApiKey = hasAnyCredential(['AZURE_OPENAI_API_KEY', 'AZURE_API_KEY'], env);
  const hasClientCreds =
    hasCredential('AZURE_CLIENT_ID', env) &&
    hasCredential('AZURE_CLIENT_SECRET', env) &&
    hasCredential('AZURE_TENANT_ID', env);
  const hasDeployment = hasCredential('AZURE_OPENAI_DEPLOYMENT_NAME', env);

  return (hasApiKey || hasClientCreds) && hasDeployment;
}

// =============================================================================
// Provider Set Factory
// =============================================================================

/**
 * Create a standardized provider set with sensible defaults.
 *
 * Fallback chain for synthesizeProvider:
 *   synthesize ?? gradingJson ?? grading
 *
 * This is because synthesize operations typically need JSON output capability,
 * so gradingJson is preferred over plain grading when synthesize isn't specified.
 */
function createProviderSet(options: ProviderSetOptions): DefaultProviders {
  return {
    embeddingProvider: options.embedding ?? OpenAiEmbeddingProvider,
    gradingProvider: options.grading,
    gradingJsonProvider: options.gradingJson ?? options.grading,
    suggestionsProvider: options.suggestions ?? options.grading,
    synthesizeProvider: options.synthesize ?? options.gradingJson ?? options.grading,
    llmRubricProvider: options.llmRubric,
    moderationProvider: OpenAiModerationProvider,
  };
}

/**
 * Create OpenAI provider set (used for both explicit credentials and fallback).
 */
function createOpenAIProviders(): DefaultProviders {
  return createProviderSet({
    grading: OpenAiGradingProvider,
    gradingJson: OpenAiGradingJsonProvider,
    suggestions: OpenAiSuggestionsProvider,
    embedding: OpenAiEmbeddingProvider,
  });
}

/**
 * Create Azure-specific providers (requires dynamic deployment name lookup).
 * Note: Azure uses the same provider for all completion tasks since it's deployment-based.
 */
function createAzureProviders(env?: EnvOverrides): DefaultProviders {
  const deploymentName =
    getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME') || env?.AZURE_OPENAI_DEPLOYMENT_NAME;
  const embeddingDeploymentName =
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME') ||
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ||
    deploymentName;

  // deploymentName is guaranteed to exist because hasAzureCredentials checks for it
  const azureProvider = new AzureChatCompletionProvider(deploymentName!, { env });
  const azureEmbeddingProvider = new AzureEmbeddingProvider(embeddingDeploymentName!, { env });

  // Use createProviderSet for consistency, but override embedding with Azure-specific provider
  return {
    ...createProviderSet({ grading: azureProvider }),
    embeddingProvider: azureEmbeddingProvider,
  };
}

// =============================================================================
// Provider Priority Chain
// =============================================================================

/**
 * Provider selection priority chain.
 *
 * Order rationale:
 *   1-7: Explicit API keys (user intentionally set these)
 *   8-10: Ambient credentials (may exist for other purposes)
 *
 * Within explicit keys, ordered by popularity/capability.
 * Ambient credentials are last because they may be set for other tools
 * (e.g., GITHUB_TOKEN for git operations, AWS creds for other AWS services).
 */
const PROVIDER_PRIORITY: ProviderCandidate[] = [
  // --- Explicit API Keys (Priority 1-7) ---
  {
    name: 'OpenAI',
    check: (env) => hasCredential('OPENAI_API_KEY', env),
    create: () => createOpenAIProviders(),
  },
  {
    name: 'Anthropic',
    check: (env) => hasCredential('ANTHROPIC_API_KEY', env),
    create: (env) => {
      const anthropic = getAnthropicProviders(env);
      return createProviderSet({
        grading: anthropic.gradingProvider,
        gradingJson: anthropic.gradingJsonProvider,
        suggestions: anthropic.suggestionsProvider,
        synthesize: anthropic.synthesizeProvider,
        llmRubric: anthropic.llmRubricProvider,
      });
    },
  },
  {
    name: 'Azure OpenAI',
    check: (env) => hasAzureCredentials(env),
    create: (env) => createAzureProviders(env),
  },
  {
    name: 'Google AI Studio',
    check: (env) => hasAnyCredential(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PALM_API_KEY'], env),
    create: () =>
      createProviderSet({
        grading: GoogleAiStudioGradingProvider,
        gradingJson: GoogleAiStudioGradingJsonProvider,
        suggestions: GoogleAiStudioSuggestionsProvider,
        synthesize: GoogleAiStudioSynthesizeProvider,
        llmRubric: GoogleAiStudioLlmRubricProvider,
        embedding: VertexEmbeddingProvider, // AI Studio doesn't support embeddings
      }),
  },
  {
    name: 'xAI',
    check: (env) => hasCredential('XAI_API_KEY', env),
    create: () =>
      createProviderSet({
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
      createProviderSet({
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
      createProviderSet({
        grading: MistralGradingProvider,
        gradingJson: MistralGradingJsonProvider,
        suggestions: MistralSuggestionsProvider,
        synthesize: MistralSynthesizeProvider,
        embedding: MistralEmbeddingProvider,
      }),
  },

  // --- Ambient Credentials (Priority 8-10) ---
  {
    name: 'Google Vertex',
    check: () => hasGoogleDefaultCredentials(),
    create: () =>
      createProviderSet({
        grading: VertexGradingProvider,
        embedding: VertexEmbeddingProvider,
      }),
  },
  {
    name: 'AWS Bedrock',
    check: (env) => hasAnyCredential(['AWS_ACCESS_KEY_ID', 'AWS_PROFILE'], env),
    create: () =>
      createProviderSet({
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
      createProviderSet({
        grading: GitHubGradingProvider,
        gradingJson: GitHubGradingJsonProvider,
        suggestions: GitHubSuggestionsProvider,
      }),
  },
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
 * Priority Order (explicit API keys first, then ambient credentials):
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
 */
export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  const providers = await selectProvidersByCredentials(env);
  return applyOverrides(providers, env);
}

// =============================================================================
// Provider Selection Logic
// =============================================================================

/**
 * Iterate through the priority chain and return the first matching provider.
 * Falls back to OpenAI if no credentials are found.
 */
async function selectProvidersByCredentials(env?: EnvOverrides): Promise<DefaultProviders> {
  for (const candidate of PROVIDER_PRIORITY) {
    const hasCredentials = await candidate.check(env);
    if (hasCredentials) {
      logger.debug(`Using ${candidate.name} default providers`);
      return candidate.create(env);
    }
  }

  // Fallback to OpenAI (may fail without key, but provides helpful error message)
  logger.debug('Using OpenAI default providers (fallback)');
  return createOpenAIProviders();
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
