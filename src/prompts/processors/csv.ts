import fs from 'fs';

import { parse } from 'csv-parse/sync';
import { getEnvBool, getEnvString } from '../../envars';

import type { Prompt } from '../../types';

/**
 * Process a CSV file containing prompts
 *
 * CSV format can be either:
 * 1. Single column with prompt text per line
 * 2. CSV with a 'prompt' column and optional 'label' column
 *
 * @param filePath Path to the CSV file
 * @param basePrompt Base prompt properties to include
 * @returns Array of processed prompts
 */
export async function processCsvPrompts(
  filePath: string,
  basePrompt: Partial<Prompt>,
): Promise<Prompt[]> {
  const content = fs.readFileSync(filePath, 'utf8');

  const delimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ',');
  const enforceStrict = getEnvBool('PROMPTFOO_CSV_STRICT', false);

  if (!content.includes(delimiter)) {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;

    return lines.slice(startIndex).map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: basePrompt.label || `Prompt ${index + 1} - ${line}`,
    }));
  }

  try {
    const parseOptions = {
      columns: true,
      bom: true,
      delimiter,
      relax_quotes: !enforceStrict,
      skip_empty_lines: true,
      trim: true,
    };

    const records = parse(content, parseOptions);

    return records
      .filter((row: Record<string, string>) => row.prompt)
      .map((row: Record<string, string>, index: number) => {
        return {
          ...basePrompt,
          raw: row.prompt,
          label: row.label || basePrompt.label || `Prompt ${index + 1} - ${row.prompt}`,
        };
      });
  } catch {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;

    return lines.slice(startIndex).map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: basePrompt.label || `Prompt ${index + 1} - ${line}`,
    }));
  }
}
