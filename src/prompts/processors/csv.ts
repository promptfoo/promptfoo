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

function buildCsvPrompts(
  rows: Array<{ raw: string; label?: string }>,
  basePrompt: Partial<Prompt>,
): Prompt[] {
  const hasMultipleRows = rows.length > 1;

  const usedLabels = new Set(rows.flatMap((row) => (row.label ? [row.label] : [])));

  return rows.map((row, index) => {
    let label = row.label || buildCsvRowLabel(basePrompt.label, row.raw, index, hasMultipleRows);

    if (!row.label) {
      const initialLabel = label;
      let suffix = 1;
      while (usedLabels.has(label)) {
        label = `${initialLabel} (row ${index + 1}${suffix > 1 ? `.${suffix}` : ''})`;
        suffix++;
      }
      usedLabels.add(label);
    }

    const id = hasMultipleRows && basePrompt.id ? `${basePrompt.id}:${index + 1}` : basePrompt.id;

    return { ...basePrompt, raw: row.raw, label, ...(id && { id }) };
  });
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
    return buildCsvPrompts(
      promptLines.map((raw) => ({ raw })),
      basePrompt,
    );
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
    return buildCsvPrompts(
      promptRecords.map((row) => ({ raw: row.prompt, label: row.label })),
      basePrompt,
    );
  } catch {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    const startIndex = lines[0]?.toLowerCase().trim() === 'prompt' ? 1 : 0;
    const promptLines = lines.slice(startIndex);
    return buildCsvPrompts(
      promptLines.map((raw) => ({ raw })),
      basePrompt,
    );
  }
}
