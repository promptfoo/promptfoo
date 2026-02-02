import type { Prompt } from '../../types/prompts';

/**
 * Filters prompts by label or id using a regex pattern.
 * Similar to filterProviders, this allows users to run evaluations
 * with only specific prompts matching the pattern.
 *
 * @param prompts - Array of prompts to filter
 * @param filterOption - Regex pattern to match against prompt label or id
 * @param flags - Optional regex flags (e.g., 'i' for case-insensitive)
 * @returns Filtered array of prompts matching the pattern
 */
export function filterPrompts(prompts: Prompt[], filterOption?: string, flags?: string): Prompt[] {
  if (!filterOption) {
    return prompts;
  }

  const filterRegex = new RegExp(filterOption, flags);

  return prompts.filter((prompt) => {
    return filterRegex.test(prompt.label) || (prompt.id && filterRegex.test(prompt.id));
  });
}
