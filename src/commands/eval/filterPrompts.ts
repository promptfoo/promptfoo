import type { Prompt } from '../../types/index';

/**
 * Filters prompts by id or label using a regex pattern.
 * Matches the same semantics as filterProviders for consistency.
 *
 * @param prompts - Array of prompts to filter
 * @param filterPromptsOption - Optional regex pattern to match against prompt id or label
 * @returns Filtered array of prompts whose id or label match the pattern
 */
export function filterPrompts(prompts: Prompt[], filterPromptsOption?: string): Prompt[] {
  if (!filterPromptsOption) {
    return prompts;
  }

  let filterRegex: RegExp;
  try {
    filterRegex = new RegExp(filterPromptsOption);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Invalid regex pattern for --filter-prompts: "${filterPromptsOption}". ${errorMessage}`,
    );
  }

  return prompts.filter((prompt) => {
    const promptId = prompt.id;
    const promptLabel = prompt.label;

    return (
      (promptId && filterRegex.test(promptId)) || (promptLabel && filterRegex.test(promptLabel))
    );
  });
}
