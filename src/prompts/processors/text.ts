import * as fs from 'fs';

import { getEnvString } from '../../envars';

import type { Prompt } from '../../types/index';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processTxtFile(filePath: string, { label }: Partial<Prompt>): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

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

  // Resolve after --env-file and the config's env block have been applied.
  const delimiter = getEnvString('PROMPTFOO_PROMPT_SEPARATOR') || '---';
  for (const line of lines) {
    if (line.trim() === delimiter) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return prompts;
}
