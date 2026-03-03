import type { ChatMessage, ProviderResponse } from '../types/providers';

export type { ChatMessage };

/**
 * Extracts the actual prompt from a ProviderResponse as a string.
 *
 * Priority chain:
 * 1. response.prompt (provider-reported) - takes precedence
 * 2. metadata.redteamFinalPrompt (legacy) - fallback for older redteam results
 * 3. undefined if neither is set
 *
 * If the prompt is an array of chat messages, it will be JSON stringified.
 *
 * @param response - The provider response object
 * @param options - Optional configuration
 * @param options.formatted - If true, JSON stringify with indentation for display (default: false)
 * @returns The actual prompt as a string, or undefined if not available
 */
export function getActualPrompt(
  response: ProviderResponse | undefined,
  options: { formatted?: boolean } = {},
): string | undefined {
  if (!response) {
    return undefined;
  }

  // Check response.prompt first (provider-reported)
  if (response.prompt !== undefined) {
    if (typeof response.prompt === 'string') {
      // Empty string is valid - provider explicitly set it
      return response.prompt || undefined;
    }
    // Array of chat messages - stringify
    if (Array.isArray(response.prompt) && response.prompt.length > 0) {
      return options.formatted
        ? JSON.stringify(response.prompt, null, 2)
        : JSON.stringify(response.prompt);
    }
    // Empty array is not useful
    return undefined;
  }

  // Fall back to legacy redteamFinalPrompt
  return response.metadata?.redteamFinalPrompt;
}

/**
 * Gets the actual prompt with fallback to the original rendered prompt.
 *
 * Priority chain:
 * 1. response.prompt (provider-reported)
 * 2. metadata.redteamFinalPrompt (legacy)
 * 3. originalPrompt (the rendered template)
 *
 * @param response - The provider response object
 * @param originalPrompt - The original rendered prompt template
 * @param options - Optional configuration
 * @returns The actual prompt as a string
 */
export function getActualPromptWithFallback(
  response: ProviderResponse | undefined,
  originalPrompt: string,
  options: { formatted?: boolean } = {},
): string {
  return getActualPrompt(response, options) || originalPrompt;
}
