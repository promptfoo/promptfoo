import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { ApiProvider } from '../types';

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

  // Anthropic has built-in web search capabilities
  // No tool configuration needed - web search is automatically available
  if (id.includes('anthropic')) {
    return true;
  }

  return false;
}

/**
 * Load a provider with web search capabilities
 * @param preferAnthropic Whether to try Anthropic first (true) or OpenAI first (false)
 * @returns A provider with web search capabilities or null
 */
export async function loadWebSearchProvider(
  preferAnthropic: boolean = false,
): Promise<ApiProvider | null> {
  const providers = preferAnthropic
    ? [
        // For web-search assertion, prefer Anthropic (built-in web search)
        async () => {
          try {
            return await loadApiProvider('anthropic:messages:claude-sonnet-4');
          } catch {
            return null;
          }
        },
        // Try OpenAI responses API
        async () => {
          try {
            return await loadApiProvider('openai:responses:o4-mini', {
              options: {
                config: { tools: [{ type: 'web_search_preview' }] },
              },
            });
          } catch {
            return null;
          }
        },
        // Try Perplexity (has built-in web search)
        async () => {
          try {
            return await loadApiProvider('perplexity:sonar');
          } catch {
            return null;
          }
        },
        // Google/Gemini with search tools
        async () => {
          try {
            return await loadApiProvider('google:gemini-2.5-flash', {
              options: {
                config: { tools: [{ googleSearch: {} }] },
              },
            });
          } catch {
            return null;
          }
        },
      ]
    : [
        // Try OpenAI first when preferAnthropic is false
        async () => {
          try {
            return await loadApiProvider('openai:responses:o4-mini', {
              options: {
                config: { tools: [{ type: 'web_search_preview' }] },
              },
            });
          } catch {
            return null;
          }
        },
        // Try Perplexity (has built-in web search)
        async () => {
          try {
            return await loadApiProvider('perplexity:sonar');
          } catch {
            return null;
          }
        },
        // Google/Gemini with search tools
        async () => {
          try {
            return await loadApiProvider('google:gemini-2.5-flash', {
              options: {
                config: { tools: [{ googleSearch: {} }] },
              },
            });
          } catch {
            return null;
          }
        },
        async () => {
          try {
            return await loadApiProvider('vertex:gemini-2.5-flash', {
              options: {
                config: { tools: [{ googleSearch: {} }] },
              },
            });
          } catch {
            return null;
          }
        },
        // xAI with search parameters
        async () => {
          try {
            return await loadApiProvider('xai:grok-2', {
              options: {
                config: { search_parameters: { mode: 'on' } },
              },
            });
          } catch {
            return null;
          }
        },
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
