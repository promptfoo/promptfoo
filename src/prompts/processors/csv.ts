import { parse } from 'csv-parse/sync';
import fs from 'fs';
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
  // Read the file content
  const content = fs.readFileSync(filePath, 'utf8');

  // Handle empty file
  if (!content.trim()) {
    return [];
  }

  const delimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ',');
  const enforceStrict = getEnvBool('PROMPTFOO_CSV_STRICT', false);

  // Process as a plain text file if it doesn't contain the delimiter
  if (!content.includes(delimiter)) {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    // Skip first line if it's "prompt"
    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;

    return lines.slice(startIndex).map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: basePrompt.label || `Prompt ${index + 1}`,
    }));
  }

  // Process as a CSV file
  try {
    // Define parse options based on environment settings
    const parseOptions = {
      columns: true,
      bom: true,
      delimiter,
      relax_quotes: !enforceStrict,
      skip_empty_lines: true,
      trim: true,
    };

    // Parse the CSV content
    const records = parse(content, parseOptions);

    // Filter rows with prompt values and map to Prompt objects
    return records
      .filter((row: Record<string, string>) => row.prompt)
      .map((row: Record<string, string>, index: number) => {
        // Create the prompt object
        return {
          ...basePrompt,
          raw: row.prompt,
          label: row.label || basePrompt.label || `Prompt ${index + 1}`,
        };
      });
  } catch {
    // If CSV parsing fails, try as a plain text file without CSV structure
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    // Skip first line if it's "prompt"
    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;

    return lines.slice(startIndex).map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: basePrompt.label || `Prompt ${index + 1}`,
    }));
  }
}
