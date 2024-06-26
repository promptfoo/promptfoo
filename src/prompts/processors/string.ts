import { Prompt } from '../../types';

/**
 * Processes a string as a literal prompt.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts created from the string.
 */
export function processString(prompt: Partial<Prompt>): Prompt[] {
  return [
    {
      raw: prompt!.raw as string,
      label: prompt.label ?? `${prompt.raw}`,
    },
  ];
}
