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

  const filterRegex = new RegExp(filterPromptsOption);

  return prompts.filter((prompt) => {
    const promptId = prompt.id;
    const promptLabel = prompt.label;

    return (
      (promptId && filterRegex.test(promptId)) || (promptLabel && filterRegex.test(promptLabel))
    );
  });
}
