import logger from '../logger';
import { loadApiProvider } from '../providers/index';

import type { ApiProvider } from '../types/index';

/**
 * Check if a provider has web search capabilities
 * @param provider The provider to check
 * @returns true if the provider supports web search
 */
export function hasWebSearchCapability(provider: ApiProvider | null | undefined): boolean {
  if (!provider) {
    return false;
  }
  const id = provider.id();

  // Perplexity has built-in web search
  if (id.includes('perplexity')) {
    return true;
  }

  // Check for Google/Gemini with search tools
  if (
    (id.includes('google') || id.includes('gemini') || id.includes('vertex')) &&
    provider.config?.tools?.some((t: any) => t.googleSearch !== undefined)
  ) {
    return true;
  }

  // Check for xAI with search parameters
  if (id.includes('xai') && provider.config?.search_parameters?.mode === 'on') {
    return true;
  }

  // Check for OpenAI responses API with web_search_preview tool
  if (
    id.includes('openai:responses') &&
    provider.config?.tools?.some((t: any) => t.type === 'web_search_preview')
  ) {
    return true;
  }

  // Check for Anthropic with web_search tool
  if (
    id.includes('anthropic') &&
    provider.config?.tools?.some((t: any) => t.type === 'web_search_20250305')
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
  // Anthropic Claude 4.6 Opus (February 2026 checkpoint) with web search tool
  const loadAnthropicWebSearch = async () => {
    try {
      return await loadApiProvider('anthropic:messages:claude-opus-4-6-20260205', {
        options: {
          config: {
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 5,
              } as any,
            ],
          },
        },
      });
    } catch (err) {
      logger.debug(`Failed to load Anthropic web search provider: ${err}`);
      return null;
    }
  };

  // OpenAI GPT-5.1 with web search tool (via responses API)
  const loadOpenAIWebSearch = async () => {
    try {
      return await loadApiProvider('openai:responses:gpt-5.1', {
        options: {
          config: { tools: [{ type: 'web_search_preview' }] },
        },
      });
    } catch (err) {
      logger.debug(`Failed to load OpenAI web search provider: ${err}`);
      return null;
    }
  };

  // Perplexity Sonar Pro (built-in web search)
  const loadPerplexity = async () => {
    try {
      return await loadApiProvider('perplexity:sonar-pro');
    } catch (err) {
      logger.debug(`Failed to load Perplexity provider: ${err}`);
      return null;
    }
  };

  // Google Gemini 3 Pro Preview with googleSearch tool
  const loadGoogleWebSearch = async () => {
    try {
      return await loadApiProvider('google:gemini-3-pro-preview', {
        options: {
          config: { tools: [{ googleSearch: {} }] },
        },
      });
    } catch (err) {
      logger.debug(`Failed to load Google web search provider: ${err}`);
      return null;
    }
  };

  // Vertex AI Gemini 3 Pro Preview with googleSearch tool
  const loadVertexWebSearch = async () => {
    try {
      return await loadApiProvider('vertex:gemini-3-pro-preview', {
        options: {
          config: { tools: [{ googleSearch: {} }] },
        },
      });
    } catch (err) {
      logger.debug(`Failed to load Vertex web search provider: ${err}`);
      return null;
    }
  };

  // xAI Grok 4.1 Fast Reasoning with live web search
  const loadXaiWebSearch = async () => {
    try {
      return await loadApiProvider('xai:grok-4-1-fast-reasoning', {
        options: {
          config: { search_parameters: { mode: 'on' } },
        },
      });
    } catch (err) {
      logger.debug(`Failed to load xAI web search provider: ${err}`);
      return null;
    }
  };

  // Order providers based on preference
  const providers = preferAnthropic
    ? [
        loadAnthropicWebSearch,
        loadOpenAIWebSearch,
        loadPerplexity,
        loadGoogleWebSearch,
        loadVertexWebSearch,
        loadXaiWebSearch,
      ]
    : [
        loadOpenAIWebSearch,
        loadAnthropicWebSearch,
        loadPerplexity,
        loadGoogleWebSearch,
        loadVertexWebSearch,
        loadXaiWebSearch,
      ];

  for (const getProvider of providers) {
    const provider = await getProvider();
    if (provider) {
      logger.info(`Using ${provider.id()} as web search provider`);
      return provider;
    }
  }

  return null;
}
