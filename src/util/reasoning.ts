import type { ProviderResponse, ReasoningContent } from '../types/providers';

/**
 * Extract text content from a reasoning array for display or export.
 * Handles all provider-specific formats and returns a unified string.
 *
 * @param reasoning - Array of reasoning content blocks
 * @returns Combined reasoning text, or empty string if none
 */
export function reasoningToString(reasoning: ReasoningContent[] | undefined): string {
  if (!reasoning?.length) {
    return '';
  }

  return reasoning
    .map((r) => {
      switch (r.type) {
        case 'thinking':
          return r.thinking;
        case 'redacted_thinking':
          return '[Redacted]';
        case 'reasoning':
        case 'think':
          return r.content;
        case 'thought':
          return r.thought;
        default:
          // Exhaustive check - TypeScript will error if we miss a type
          const _exhaustiveCheck: never = r;
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Check if a provider response contains any reasoning content.
 *
 * @param response - The provider response to check
 * @returns True if reasoning content is present
 */
export function hasReasoning(response: ProviderResponse | undefined): boolean {
  return Boolean(response?.reasoning?.length);
}

/**
 * Get the total reasoning token count from a provider response.
 * Reasoning tokens are stored in tokenUsage.completionDetails.reasoning.
 *
 * @param response - The provider response to check
 * @returns The reasoning token count, or undefined if not available
 */
export function getReasoningTokens(response: ProviderResponse | undefined): number | undefined {
  return response?.tokenUsage?.completionDetails?.reasoning;
}

/**
 * Combine reasoning and output into a single string for backwards compatibility.
 * This mimics the old behavior where reasoning was prepended to output.
 *
 * @param response - The provider response
 * @param prefix - Optional prefix for reasoning (default: 'Reasoning')
 * @returns Combined string with reasoning (if any) followed by output
 */
export function combineReasoningAndOutput(
  response: ProviderResponse | undefined,
  prefix: string = 'Reasoning',
): string {
  if (!response) {
    return '';
  }

  const parts: string[] = [];

  const reasoning = reasoningToString(response.reasoning);
  if (reasoning) {
    parts.push(`${prefix}: ${reasoning}`);
  }

  if (response.output !== undefined && response.output !== null) {
    const outputStr = typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
    parts.push(outputStr);
  }

  return parts.join('\n\n');
}
