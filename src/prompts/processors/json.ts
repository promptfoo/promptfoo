import * as fs from 'fs';

import { maybeLoadConfigFromExternalFile } from '../../util/file';

import type { Prompt } from '../../types/index';

/**
 * Processes a JSON file to extract prompts.
 * This function reads a JSON file and converts it to a `Prompt` object.
 * Any file:// references within the JSON content are recursively resolved.
 *
 * @param filePath - The path to the JSON file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of one `Prompt` object.
 * @throws Will throw an error if the file cannot be read.
 */
export function processJsonFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const fileContents = fs.readFileSync(filePath, 'utf8');

  // Try to parse and resolve file:// references
  let processedContents = fileContents;
  try {
    const parsed = JSON.parse(fileContents);
    // Recursively resolve any file:// references in the parsed structure
    const resolved = maybeLoadConfigFromExternalFile(parsed);
    processedContents = JSON.stringify(resolved);
  } catch {
    // If parsing fails, return the original contents
    // This maintains backward compatibility for non-JSON or invalid JSON files
  }

  return [
    {
      raw: processedContents,
      label: prompt.label || `${filePath}: ${processedContents}`,
      config: prompt.config,
    },
  ];
}
