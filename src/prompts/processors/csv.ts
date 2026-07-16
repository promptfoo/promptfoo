import fs from 'fs';

import { type Options, parse } from 'csv-parse/sync';
import { getEnvBool, getEnvString } from '../../envars';

import type { Prompt } from '../../types/index';

type CsvParseOptionsWithColumns<T> = Omit<Options<T>, 'columns'> & {
  columns: Exclude<Options['columns'], undefined | false>;
};

/**
 * Builds a row's label. Prompt ids are derived from the label, so a shared
 * `basePrompt.label` must be disambiguated when a file yields multiple rows
 * (mirroring jsonl.ts's `containsMultiple` pattern).
 */
function buildCsvRowLabel(
  baseLabel: string | undefined,
  content: string,
  index: number,
  hasMultipleRows: boolean,
): string {
  if (baseLabel) {
    return hasMultipleRows ? `${baseLabel}: ${content}` : baseLabel;
  }
  return `Prompt ${index + 1} - ${content}`;
}

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
    const promptLines = lines.slice(startIndex);
    const hasMultipleRows = promptLines.length > 1;

    return promptLines.map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: buildCsvRowLabel(basePrompt.label, line, index, hasMultipleRows),
    }));
  }

  try {
    const parseOptions: CsvParseOptionsWithColumns<Record<string, string>> = {
      columns: true as const,
      bom: true,
      delimiter,
      relax_quotes: !enforceStrict,
      skip_empty_lines: true,
      trim: true,
    };

    const records = parse<Record<string, string>>(content, parseOptions);
    const promptRecords = records.filter((row) => row.prompt);
    const hasMultipleRows = promptRecords.length > 1;

    return promptRecords.map((row, index) => {
      return {
        ...basePrompt,
        raw: row.prompt,
        label: row.label || buildCsvRowLabel(basePrompt.label, row.prompt, index, hasMultipleRows),
      };
    });
  } catch {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;
    const promptLines = lines.slice(startIndex);
    const hasMultipleRows = promptLines.length > 1;

    return promptLines.map((line, index) => ({
      ...basePrompt,
      raw: line,
      label: buildCsvRowLabel(basePrompt.label, line, index, hasMultipleRows),
    }));
  }
}
