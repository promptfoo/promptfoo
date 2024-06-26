import * as fs from 'fs';
import { Prompt } from '../../types';
import { PROMPT_DELIMITER } from '../constants';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processTxtFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return fileContent
    .split(PROMPT_DELIMITER)
    .map((p) => ({
      raw: p.trim(),
      label: prompt.label ? `${prompt.label}: ${p.trim()}` : `${prompt.raw}: ${p.trim()}`,
    }))
    .filter((p) => p.raw.length > 0); // handle leading/trailing delimiters and empty lines
}
