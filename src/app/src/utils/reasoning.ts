import type { ReasoningContent } from '@promptfoo/types';

/**
 * Extract text content from a reasoning array for display.
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
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Check if reasoning content exists and has content.
 *
 * @param reasoning - Array of reasoning content blocks
 * @returns True if reasoning content is present
 */
export function hasReasoning(reasoning: ReasoningContent[] | undefined): boolean {
  return Boolean(reasoning?.length);
}
