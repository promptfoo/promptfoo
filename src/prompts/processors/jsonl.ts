import * as fs from 'fs';

import type { Prompt } from '../../types/index';

/**
 * Processes a JSONL file to extract prompts.
 * @param filePath - Path to the JSONL file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export function processJsonlFile(
  filePath: string,
  prompt: Partial<Prompt>,
  labelPath: string = filePath,
): Prompt[] {
  // Drop a UTF-8 byte order mark so the first line still parses as JSON.
  const fileContent = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
  const containsMultiple = jsonLines.length > 1;
  return jsonLines.map((json) => ({
    raw: json,
    label: containsMultiple
      ? prompt.label
        ? `${prompt.label}: ${json}`
        : `${labelPath}: ${json}`
      : prompt.label || labelPath,
    config: prompt.config,
  }));
}
