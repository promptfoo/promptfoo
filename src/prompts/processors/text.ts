import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';
import { PROMPT_DELIMITER } from '../constants';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export async function processTxtFile(
  filePath: string,
  { label }: Partial<Prompt>,
): Promise<Prompt[]> {
  const fileContent = await loadFile(filePath);

  // Make sure we have a string (fileContent could be other types from loadFile)
  const contentStr = typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent);

  return contentStr // handle leading/trailing delimiters and empty lines
    .split(PROMPT_DELIMITER)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((prompt) => ({
      raw: prompt,
      label: label ? `${label}: ${filePath}: ${prompt}` : `${filePath}: ${prompt}`,
      // no config
    }));
}
