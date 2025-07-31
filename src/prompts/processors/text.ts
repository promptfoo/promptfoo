import { readFileSync } from 'node:fs';
import { PROMPT_DELIMITER } from '../constants';

import type { Prompt } from '../../types';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processTxtFile(filePath: string, { label }: Partial<Prompt>): Prompt[] {
  const fileContent = readFileSync(filePath, 'utf-8');

  const lines = fileContent.split(/\r?\n/);
  const prompts: Prompt[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const raw = buffer.join('\n').trim();
    if (raw.length > 0) {
      prompts.push({
        raw,
        label: label ? `${label}: ${filePath}: ${raw}` : `${filePath}: ${raw}`,
        // no config
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.trim() === PROMPT_DELIMITER) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return prompts;
}
