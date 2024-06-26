import * as fs from 'fs';
import { Prompt } from '../../types';

/**
 * Processes a JSON file to extract prompts.
 * This function reads a JSON file, parses it, and maps each entry to a `Prompt` object.
 * Each prompt is labeled with the file path and the JSON content.
 *
 * @param filePath - The path to the JSON file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of `Prompt` objects extracted from the JSON file.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
export function processJsonFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  // NOTE: We do not validate if this is a valid JSON file.
  return [
    {
      raw: fileContents,
      label: prompt.label || `${filePath}: ${fileContents}`,
    },
  ];
}
