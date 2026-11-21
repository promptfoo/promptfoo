import { getEnvString } from '../envars';
import logger from '../logger';
import { getAnthropicProviders } from './anthropic/defaults';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureModerationProvider } from './azure/moderation';
import { resolveProviderApiKey } from './credentials';
import { resolveProviderEnv } from './env';
import {
  AIStudioChatProvider,
  AIStudioEmbeddingProvider,
  getGoogleAiStudioProviders,
} from './google/ai.studio';
import { hasGoogleDefaultCredentials } from './google/util';
import {
  getGoogleVertexEmbeddingProvider,
  getGoogleVertexProviders,
  VertexChatProvider,
} from './google/vertex';
import {
  MistralChatCompletionProvider,
  MistralEmbeddingProvider as MistralEmbeddingApiProvider,
} from './mistral';
import { getMistralProviders } from './mistral/defaults';
import { getCodexDefaultProviders, hasCodexDefaultCredentials } from './openai/codexDefaults';
import { getOpenAiProviders } from './openai/defaults';
import { withRedteamDefaults } from './redteamDefaults';
import { VoyageEmbeddingProvider } from './voyage';
import { getXAIProviders } from './xai/defaults';

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

async function getEmbeddingProviderForAzureDefaults(env?: EnvOverrides): Promise<ApiProvider> {
  if (defaultEmbeddingProvider) {
    return defaultEmbeddingProvider;
  }

  const embeddingDeploymentName =
    env?.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ??
    getEnvString('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME');
  if (embeddingDeploymentName) {
    return new AzureEmbeddingProvider(embeddingDeploymentName, { env });
  }

  // A chat deployment is not an embedding deployment. Prefer configured embedding
  // API credentials before probing ADC, without changing Azure's chat selection.
  if (resolveProviderApiKey(undefined, env, ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PALM_API_KEY'])) {
    return new AIStudioEmbeddingProvider('gemini-embedding-001', { env });
  }
  if (resolveProviderApiKey(undefined, env, ['MISTRAL_API_KEY'])) {
    return new MistralEmbeddingApiProvider({ env });
  }
  if (resolveProviderApiKey(undefined, env, ['VOYAGE_API_KEY'])) {
    return new VoyageEmbeddingProvider('voyage-3.5', {}, env);
  }
  if (await hasGoogleDefaultCredentials()) {
    return getGoogleVertexEmbeddingProvider(env);
  }
  return getOpenAiProviders(env).embeddingProvider;
}

interface DefaultProviderPreferences {
  preferAnthropic: boolean;
  azureDeployment?: string;
  useCodexDefaults: boolean;
  useGoogleAiStudioDefaults: boolean;
  useGoogleVertexDefaults: boolean;
  useMistralDefaults: boolean;
  useXAIDefaults: boolean;
}

async function getDefaultProviderPreferences(
  env: EnvOverrides | undefined,
  allowCodex: boolean,
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

  const azureDeployment =
    !hasOpenAiCredentials && (hasAzureApiKey || hasAzureClientCreds)
      ? resolveProviderEnv(env, ['AZURE_OPENAI_DEPLOYMENT_NAME', 'AZURE_DEPLOYMENT_NAME'])?.value
      : undefined;
  const preferAnthropic = !hasOpenAiCredentials && hasAnthropicCredentials;
  const shouldUseFallbackDefaults =
    !azureDeployment &&
    !hasOpenAiCredentials &&
    !hasAnthropicCredentials &&
    !hasGoogleAiStudioCredentials;
  const useGoogleVertexDefaults = shouldUseFallbackDefaults
    ? await hasGoogleDefaultCredentials()
    : false;
  const useNonGoogleFallbackDefaults = shouldUseFallbackDefaults && !useGoogleVertexDefaults;
  const hasCodexCredentials =
    allowCodex &&
    useNonGoogleFallbackDefaults &&
    !hasMistralCredentials &&
    !hasXAICredentials &&
    hasCodexDefaultCredentials(env);

  return {
    preferAnthropic,
    azureDeployment,
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

export async function getDefaultProviders(
  env?: EnvOverrides,
  { allowCodex = true } = {},
): Promise<DefaultProviders> {
  const {
    preferAnthropic,
    azureDeployment,
    useCodexDefaults,
    useGoogleAiStudioDefaults,
    useGoogleVertexDefaults,
    useMistralDefaults,
    useXAIDefaults,
  } = await getDefaultProviderPreferences(env, allowCodex);

  const openAiProviders = getOpenAiProviders(env);

  let providers: Pick<DefaultProviders, keyof DefaultProviders>;

  if (azureDeployment) {
    logger.debug('Using Azure OpenAI default providers');
    const azureProvider = new AzureChatCompletionProvider(azureDeployment, { env });

    providers = withRedteamDefaults(
      {
        embeddingProvider: await getEmbeddingProviderForAzureDefaults(env),
        gradingJsonProvider: azureProvider,
        gradingProvider: azureProvider,
        moderationProvider: openAiProviders.moderationProvider,
        suggestionsProvider: azureProvider,
        synthesizeProvider: azureProvider,
      },
      env,
      (env, temperature, jsonOnly) =>
        new AzureChatCompletionProvider(azureDeployment, {
          env,
          config: { temperature, ...(jsonOnly && { response_format: { type: 'json_object' } }) },
        }),
    );
  } else if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    const anthropicProviders = getAnthropicProviders(env);

    providers = {
      embeddingProvider: openAiProviders.embeddingProvider, // TODO(ian): Voyager instead?
      gradingJsonProvider: anthropicProviders.gradingJsonProvider,
      gradingProvider: anthropicProviders.gradingProvider,
      llmRubricProvider: anthropicProviders.llmRubricProvider,
      moderationProvider: openAiProviders.moderationProvider,
      suggestionsProvider: anthropicProviders.suggestionsProvider,
      synthesizeProvider: anthropicProviders.synthesizeProvider,
      webSearchProvider: anthropicProviders.webSearchProvider,
      get redteamProvider() {
        return anthropicProviders.redteamProvider;
      },
      get redteamJsonProvider() {
        return anthropicProviders.redteamJsonProvider;
      },
    };
  } else if (useGoogleAiStudioDefaults || useGoogleVertexDefaults) {
    const google = useGoogleAiStudioDefaults
      ? {
          embeddingProvider: getGoogleVertexEmbeddingProvider(env),
          ...getGoogleAiStudioProviders(env),
        }
      : getGoogleVertexProviders(env);
    const ChatProvider = useGoogleAiStudioDefaults ? AIStudioChatProvider : VertexChatProvider;
    providers = withRedteamDefaults(
      {
        moderationProvider: openAiProviders.moderationProvider,
        ...google,
      },
      env,
      (env, temperature, jsonOnly) =>
        new ChatProvider('gemini-2.5-pro', {
          env,
          config: {
            temperature,
            ...(jsonOnly && { generationConfig: { response_mime_type: 'application/json' } }),
          },
        }),
    );
  } else if (useMistralDefaults) {
    logger.debug('Using Mistral default providers');
    const mistralProviders = getMistralProviders(env);
    providers = withRedteamDefaults(
      {
        embeddingProvider: mistralProviders.embeddingProvider,
        gradingJsonProvider: mistralProviders.gradingJsonProvider,
        gradingProvider: mistralProviders.gradingProvider,
        moderationProvider: openAiProviders.moderationProvider,
        suggestionsProvider: mistralProviders.suggestionsProvider,
        synthesizeProvider: mistralProviders.synthesizeProvider,
      },
      env,
      (env, temperature, jsonOnly) =>
        new MistralChatCompletionProvider('mistral-large-latest', {
          env,
          config: { temperature, ...(jsonOnly && { response_format: { type: 'json_object' } }) },
        }),
    );
  } else if (useXAIDefaults) {
    logger.debug('Using xAI default providers');
    providers = Object.assign(getXAIProviders(env), {
      embeddingProvider: openAiProviders.embeddingProvider, // xAI doesn't expose an embeddings API
      moderationProvider: openAiProviders.moderationProvider, // xAI doesn't expose a moderation API
    });
  } else if (useCodexDefaults) {
    logger.debug('Using Codex SDK default providers from ChatGPT/Codex credentials');
    providers = {
      embeddingProvider: openAiProviders.embeddingProvider,
      moderationProvider: openAiProviders.moderationProvider,
      ...getCodexDefaultProviders(env),
    };
  } else {
    logger.debug('Using OpenAI default providers');

    providers = {
      embeddingProvider: openAiProviders.embeddingProvider,
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

  if (defaultEmbeddingProvider) {
    EMBEDDING_PROVIDERS.forEach((provider) => {
      providers[provider] = defaultEmbeddingProvider;
    });
  }
  return providers;
}
