import { sha256 } from '../util/createHash';

/**
 * Minimal interface for prompt ID generation.
 * This is compatible with both the Prompt type and PromptSchema inference.
 */
interface PromptForIdGeneration {
  label?: string;
  id?: string;
  raw: string | object;
}

/**
 * Generates a unique identifier for a prompt based on its properties.
 *
 * Priority order:
 * 1. If label is truthy, hash the label
 * 2. If id is truthy, hash the id
 * 3. Otherwise, hash the raw content (stringified if object)
 *
 * @param prompt - The prompt object to generate an ID for
 * @returns A SHA-256 hash string
 */
export function generateIdFromPrompt(prompt: PromptForIdGeneration): string {
  if (prompt.label) {
    return sha256(prompt.label);
  }
  if (prompt.id) {
    return sha256(prompt.id);
  }
  return sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw);
}
