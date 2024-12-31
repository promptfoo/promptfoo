import type { Prompt } from '../../types';
import invariant from '../../util/invariant';

/**
 * Processes a string as a literal prompt.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts created from the string.
 */
export function processString(prompt: Partial<Prompt>): Prompt[] {
  invariant(
    typeof prompt.raw === 'string',
    `prompt.raw must be a string, but got ${JSON.stringify(prompt.raw)}`,
  );
  return [
    {
      raw: prompt.raw,
      label: prompt.label ?? `${prompt.raw}`,
      config: prompt.config,
    },
  ];
}
