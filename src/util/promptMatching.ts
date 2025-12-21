import type { Prompt } from '../types/index';

/**
 * Checks if a prompt reference matches a given prompt by label or ID.
 * Supports exact matching, wildcard matching (e.g., 'Group:*'),
 * and legacy prefix matching (e.g., 'Group' matches 'Group:foo').
 *
 * @param ref - The reference string (label, ID, or pattern)
 * @param prompt - The prompt to check against
 * @returns true if the reference matches the prompt
 */
export function doesPromptRefMatch(ref: string, prompt: Prompt): boolean {
  // Exact label match
  if (prompt.label === ref) {
    return true;
  }

  // Exact ID match
  if (prompt.id && prompt.id === ref) {
    return true;
  }

  // Wildcard match: 'Group:*' matches 'Group:foo', 'Group:bar', etc.
  if (ref.endsWith('*')) {
    const prefix = ref.slice(0, -1); // Remove the '*'
    if (prompt.label?.startsWith(prefix)) {
      return true;
    }
    if (prompt.id?.startsWith(prefix)) {
      return true;
    }
  }

  // Legacy prefix match: 'Group' matches 'Group:foo' (backward compat with providerPromptMap)
  if (prompt.label?.startsWith(`${ref}:`)) {
    return true;
  }
  if (prompt.id?.startsWith(`${ref}:`)) {
    return true;
  }

  return false;
}

/**
 * Checks if a prompt is allowed based on a list of allowed prompt references.
 *
 * @param prompt - The prompt to check
 * @param allowedPrompts - Array of allowed prompt references (labels, IDs, or patterns).
 *                         If undefined, all prompts are allowed.
 *                         If empty array, no prompts are allowed.
 * @returns true if the prompt is allowed
 */
export function isPromptAllowed(prompt: Prompt, allowedPrompts: string[] | undefined): boolean {
  // If no allowedPrompts specified (undefined), all prompts are allowed
  if (!Array.isArray(allowedPrompts)) {
    return true;
  }
  // Empty array means no prompts allowed (backward compatible behavior)
  if (allowedPrompts.length === 0) {
    return false;
  }

  return allowedPrompts.some((ref) => doesPromptRefMatch(ref, prompt));
}
