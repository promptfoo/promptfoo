import * as fs from 'fs';
import type { Prompt } from '../../types';

/**
 * Processes a JSONL file to extract prompts.
 * @param filePath - Path to the JSONL file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processJsonlFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
  const containsMultiple = jsonLines.length > 1;
  return jsonLines.map((json) => ({
    raw: json,
    label: containsMultiple
      ? prompt.label
        ? `${prompt.label}: ${json}`
        : `${filePath}: ${json}`
      : prompt.label || `${filePath}`,
    config: prompt.config,
  }));
}
