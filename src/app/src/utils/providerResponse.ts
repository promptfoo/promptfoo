/**
 * Chat message type for provider-reported prompts.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
}

/**
 * Partial ProviderResponse type for frontend usage.
 * Only includes the fields needed for prompt extraction.
 */
export interface ProviderResponsePrompt {
  prompt?: string | ChatMessage[];
  metadata?: {
    redteamFinalPrompt?: string;
    [key: string]: unknown;
  };
}

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
 * @param response - The provider response object (or the prompt/metadata fields)
 * @param options - Optional configuration
 * @param options.formatted - If true, JSON stringify with indentation for display (default: false)
 * @returns The actual prompt as a string, or undefined if not available
 */
export function getActualPrompt(
  response: ProviderResponsePrompt | undefined,
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
