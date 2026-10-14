import logger from '../logger';
import { loadApiProvider } from '../providers/index';

import type { ApiProvider } from '../types/index';

function hasTool(
  provider: ApiProvider,
  predicate: (tool: Record<string, unknown>) => boolean,
): boolean {
  return Array.isArray(provider.config?.tools) && provider.config.tools.some(predicate);
}

function getProviderId(provider: ApiProvider): string | null {
  if (typeof provider.id !== 'function') {
    return null;
  }

  try {
    return provider.id();
  } catch (err) {
    logger.debug(`Failed to read provider id: ${err}`);
    return null;
  }
}

function isOpenAiResponsesProvider(provider: ApiProvider, id: string): boolean {
  return (
    id.includes('openai:responses') || provider.constructor?.name === 'OpenAiResponsesProvider'
  );
}

function isXAIResponsesProvider(provider: ApiProvider, id: string): boolean {
  return id.includes('xai:responses') || provider.constructor?.name === 'XAIResponsesProvider';
}

/**
 * Check if a provider has web search capabilities
 * @param provider The provider to check
 * @returns true if the provider supports web search
 */
export function hasWebSearchCapability(provider: ApiProvider | null | undefined): boolean {
  if (!provider) {
    return false;
  }

  const id = getProviderId(provider);
  if (!id) {
    return false;
  }

  // Perplexity has built-in web search
  if (id.includes('perplexity')) {
    return true;
  }

  // Check for Google/Gemini with search tools
  if (
    (id.includes('google') || id.includes('gemini') || id.includes('vertex')) &&
    hasTool(provider, (t) => t.googleSearch !== undefined)
  ) {
    return true;
  }

  // Check for xAI with either the current Responses API tools or legacy Live Search params.
  if (
    id.includes('xai') &&
    (provider.config?.search_parameters?.mode === 'on' ||
      (isXAIResponsesProvider(provider, id) && hasTool(provider, (t) => t.type === 'web_search')))
  ) {
    return true;
  }

  // Check for OpenAI Responses API with either supported web-search tool.
  if (
    isOpenAiResponsesProvider(provider, id) &&
    hasTool(provider, (t) => t.type === 'web_search' || t.type === 'web_search_preview')
  ) {
    return true;
  }

  // Chat Completions search models always retrieve from the web before responding.
  const isOpenAiChat =
    !isOpenAiResponsesProvider(provider, id) &&
    (id.startsWith('openai:chat:') ||
      provider.constructor?.name === 'OpenAiChatCompletionProvider');
  const passthroughModel = provider.config?.passthrough?.model;
  const chatModelId =
    typeof passthroughModel === 'string'
      ? passthroughModel
      : 'modelName' in provider && typeof provider.modelName === 'string'
        ? provider.modelName
        : id;
  if (
    isOpenAiChat &&
    /(?:^|[/:])(?:gpt-5-search-api|gpt-4o(?:-mini)?-search-preview)(?:-|$)/.test(chatModelId)
  ) {
    return true;
  }

  // Codex SDK supports web search when explicitly enabled.
  if (
    id.startsWith('openai:codex') &&
    (provider.config?.web_search_mode === 'live' ||
      provider.config?.web_search_mode === 'cached' ||
      provider.config?.web_search_enabled === true)
  ) {
    return true;
  }

  // Check for Anthropic with any version of its dated `web_search_YYYYMMDD` server tool.
  if (
    id.includes('anthropic') &&
    hasTool(provider, (t) => typeof t.type === 'string' && /^web_search_\d{8}$/.test(t.type))
  ) {
    return true;
  }

  return false;
}

/**
 * Load a provider with web search capabilities.
 * Tries multiple providers in order of preference until one succeeds.
 * Uses the latest and most capable models from each provider with specific checkpoint IDs.
 *
 * @param preferAnthropic Whether to try Anthropic first (true) or OpenAI first (false)
 * @returns A provider with web search capabilities or null
 */
export async function loadWebSearchProvider(
  preferAnthropic: boolean = false,
): Promise<ApiProvider | null> {
  const providerLoader =
    (name: string, ...args: Parameters<typeof loadApiProvider>) =>
    async () => {
      try {
        return await loadApiProvider(...args);
      } catch (err) {
        logger.debug(`Failed to load ${name} provider: ${err}`);
        return null;
      }
    };

  const loadAnthropicWebSearch = providerLoader(
    'Anthropic web search',
    'anthropic:messages:claude-opus-5-5',
    {
      options: {
        config: {
          tools: [
            {
              type: 'web_search_20260209',
              name: 'web_search',
              max_uses: 5,
            },
          ],
        },
      },
    },
  );

  const loadOpenAIWebSearch = providerLoader('OpenAI web search', 'openai:responses:gpt-6-sol', {
    options: {
      config: { tools: [{ type: 'web_search_preview' }] },
    },
  });

  // Perplexity Sonar Pro (built-in web search)
  const loadPerplexity = providerLoader('Perplexity', 'perplexity:sonar-pro');

  // Google Gemini 3.1 Pro Preview with googleSearch tool
  const loadGoogleWebSearch = providerLoader('Google web search', 'google:gemini-3.1-pro-preview', {
    options: {
      config: { tools: [{ googleSearch: {} }] },
    },
  });

  // Vertex AI Gemini 3.1 Pro Preview with googleSearch tool
  const loadVertexWebSearch = providerLoader('Vertex web search', 'vertex:gemini-3.1-pro-preview', {
    options: {
      config: { tools: [{ googleSearch: {} }] },
    },
  });

  // xAI Grok 4.3 with Responses API web search (available to US and EU accounts)
  const loadXaiWebSearch = providerLoader('xAI web search', 'xai:responses:grok-4.3', {
    options: {
      config: { tools: [{ type: 'web_search' }] },
    },
  });

  // Order providers based on preference
  const providers = [
    preferAnthropic ? loadAnthropicWebSearch : loadOpenAIWebSearch,
    preferAnthropic ? loadOpenAIWebSearch : loadAnthropicWebSearch,
    loadPerplexity,
    loadGoogleWebSearch,
    loadVertexWebSearch,
    loadXaiWebSearch,
  ];

  for (const getProvider of providers) {
    const provider = await getProvider();
    if (provider && hasWebSearchCapability(provider)) {
      logger.info(`Using ${getProviderId(provider) ?? 'loaded provider'} as web search provider`);
      return provider;
    }
    if (provider) {
      logger.debug(
        `Loaded provider ${getProviderId(provider) ?? 'unknown'} does not support web search`,
      );
    }
  }

  return null;
}
