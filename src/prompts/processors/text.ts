import * as fs from 'fs';

import { getEnvString } from '../../envars';

import type { Prompt } from '../../types/index';

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processTxtFile(
  filePath: string,
  { label, config }: Partial<Prompt>,
  labelPath: string = filePath,
): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const lines = fileContent.split(/\r?\n/);
  const prompts: Prompt[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const raw = buffer.join('\n').trim();
    if (raw.length > 0) {
      prompts.push({
        raw,
        label: label ? `${label}: ${labelPath}: ${raw}` : `${labelPath}: ${raw}`,
        config,
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

/**
 * Processes a Markdown or Jinja2 template file to extract prompts.
 * Similar to markdown files, each file is treated as a single prompt.
 *
 * @param filePath - Path to the Markdown or Jinja2 template file.
 * @param prompt - The raw prompt data.
 * @returns Array of one `Prompt` object.
 */
export function processTemplateFile(
  filePath: string,
  prompt: Partial<Prompt>,
  labelPath: string = filePath,
): Prompt[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return [
    {
      raw: content,
      label: prompt.label || `${labelPath}: ${content.slice(0, 50)}...`,
      config: prompt.config,
    },
  ];
}
