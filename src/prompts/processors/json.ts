import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';

/**
 * Processes a JSON file to extract prompts.
 * This function reads a JSON file and converts it to a `Prompt` object.
 *
 * @param filePath - The path to the JSON file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of one `Prompt` object.
 * @throws Will throw an error if the file cannot be read.
 */
export async function processJsonFile(
  filePath: string,
  prompt: Partial<Prompt>,
): Promise<Prompt[]> {
  const fileContent = await loadFile(filePath);

  // Convert fileContent to string if it's an object (already parsed JSON)
  const contentStr = typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent);

  return [
    {
      raw: contentStr,
      label: prompt.label || `${filePath}: ${contentStr}`,
      config: prompt.config,
    },
  ];
}
