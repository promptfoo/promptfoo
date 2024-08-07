import * as fs from 'fs';
import type { Prompt } from '../../types';
import { PROMPT_DELIMITER } from '../constants';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processTxtFile(filePath: string, { label }: Partial<Prompt>): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return fileContent // handle leading/trailing delimiters and empty lines
    .split(PROMPT_DELIMITER)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((prompt) => ({
      raw: prompt,
      label: label ? `${label}: ${filePath}: ${prompt}` : `${filePath}: ${prompt}`,
      // no config
    }));
}
