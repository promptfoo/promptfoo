import type { Prompt } from '../types';
import { sha256 } from '../util/createHash';
import { VALID_FILE_EXTENSIONS } from './constants';

/**
 * Determines if a string is a valid file path.
 * @param str - The string to check.
 * @returns True if the string is a valid file path, false otherwise.
 */
export function maybeFilePath(str: string): boolean {
  if (typeof str !== 'string') {
    throw new Error(`Invalid input: ${JSON.stringify(str)}`);
  }

  const forbiddenSubstrings = ['\n', 'portkey://', 'langfuse://', 'helicone://'];
  if (forbiddenSubstrings.some((substring) => str.includes(substring))) {
    return false;
  }

  return (
    str.startsWith('file://') ||
    VALID_FILE_EXTENSIONS.some((ext) => {
      const tokens = str.split(':'); // str may be file.js:functionName
      // Checks if the second to last token or the last token ends with the extension
      return tokens.pop()?.endsWith(ext) || tokens.pop()?.endsWith(ext);
    }) ||
    str.charAt(str.length - 3) === '.' ||
    str.charAt(str.length - 4) === '.' ||
    str.includes('*') ||
    str.includes('/') ||
    str.includes('\\')
  );
}

/**
 * Normalizes the input prompt to an array of prompts, rejecting invalid and empty inputs.
 * @param promptPathOrGlobs - The input prompt.
 * @returns The normalized prompts.
 * @throws If the input is invalid or empty.
 */
export function normalizeInput(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
): Partial<Prompt>[] {
  if (
    !promptPathOrGlobs ||
    ((typeof promptPathOrGlobs === 'string' || Array.isArray(promptPathOrGlobs)) &&
      promptPathOrGlobs.length === 0)
  ) {
    throw new Error(`Invalid input prompt: ${JSON.stringify(promptPathOrGlobs)}`);
  }
  if (typeof promptPathOrGlobs === 'string') {
    return [
      {
        raw: promptPathOrGlobs,
      },
    ];
  }
  if (Array.isArray(promptPathOrGlobs)) {
    return promptPathOrGlobs.map((promptPathOrGlob, index) => {
      if (typeof promptPathOrGlob === 'string') {
        return {
          raw: promptPathOrGlob,
        };
      }
      return {
        raw: promptPathOrGlob.raw || promptPathOrGlob.id,
        ...promptPathOrGlob,
      };
    });
  }

  if (typeof promptPathOrGlobs === 'object' && Object.keys(promptPathOrGlobs).length) {
    /* NOTE: This format is considered legacy and has been deprecated. Example:
      {
        'prompts.txt': 'foo1',
        'prompts.py': 'foo2',
      }
      */
    return Object.entries(promptPathOrGlobs).map(([raw, key]) => ({
      label: key,
      raw,
    }));
  }
  // numbers, booleans, etc
  throw new Error(`Invalid input prompt: ${JSON.stringify(promptPathOrGlobs)}`);
}

export function hashPrompt(prompt: Prompt): string {
  return prompt.id || prompt.label
    ? sha256(prompt.label)
    : sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw);
}
