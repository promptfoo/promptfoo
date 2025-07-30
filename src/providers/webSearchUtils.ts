import type { ApiProvider } from '../types';

/**
 * Check if a provider has web search capabilities
 * @param provider The provider to check
 * @returns true if the provider supports web search
 */
export function hasWebSearchCapability(provider: ApiProvider | null | undefined): boolean {
  if (!provider) return false;
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