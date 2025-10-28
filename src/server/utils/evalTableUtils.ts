import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types';

import type { EvaluateTableRow, Prompt } from '../../types';

/**
 *
 *
 *
 * Keep this in it's current order, as it is used to map the columns in the CSV, so it needs to be static.
 *
 *
 * The keys are the names of the columns in the metadata object, and the values are the names of the columns in the CSV.
 *
 * This is imported by enterprise so it doesn't need to be copied.
 *
 */
export const REDTEAM_METADATA_KEYS_TO_CSV_COLUMN_NAMES = {
  messages: 'Messages',
  redteamHistory: 'RedteamHistory',
  redteamTreeHistory: 'RedteamTreeHistory',
  pluginId: 'pluginId',
  strategyId: 'strategyId',
  sessionId: 'sessionId',
  sessionIds: 'sessionIds',
};

const REDTEAM_METADATA_COLUMNS = Object.values(REDTEAM_METADATA_KEYS_TO_CSV_COLUMN_NAMES);

/**
 * Generates CSV data from evaluation table data
 * Includes grader reason, comment, and conversation columns similar to client-side implementation
 *
 * @param table - The evaluation table data
 * @param options - Export options
 * @returns CSV formatted string
 */
export function evalTableToCsv(
  table: { head: { prompts: Prompt[]; vars: string[] }; body: EvaluateTableRow[] },
  options: { isRedteam?: boolean } = { isRedteam: false },
): string {
  const csvRows: any[][] = [];
  const { isRedteam } = options;

  // Check if any rows have descriptions
  const hasDescriptions = table.body.some((row) => row.test.description);

  // Create headers with additional columns for grader reason, comment, and conversation
  const headers: string[] = [
    ...(hasDescriptions ? ['Description'] : []),
    ...table.head.vars,
    ...table.head.prompts.flatMap((prompt) => {
      // Handle both Prompt and CompletedPrompt types
      const provider = (prompt as any).provider || '';
      const label = provider ? `[${provider}] ${prompt.label}` : prompt.label;
      return [label, 'Grader Reason', 'Comment'];
    }),
  ];

  if (isRedteam) {
    headers.push(...REDTEAM_METADATA_COLUMNS);
  }
  csvRows.push(headers);

  // Process body rows with pass/fail prefixes and conversation data
  table.body.forEach((row) => {
    const rowValues: any[] = [
      ...(hasDescriptions ? [row.test.description || ''] : []),
      ...row.vars,
      ...row.outputs.flatMap((output) => {
        if (!output) {
          const emptyValues = ['', '', ''];
          if (isRedteam) {
            // handle message, redteamHistory, redteamTreeHistory columns
            emptyValues.push(...Array(REDTEAM_METADATA_COLUMNS.length).fill(''));
          }
          return emptyValues;
        }

        const baseValues = [
          // Add pass/fail/error prefix to text
          (output.pass
            ? '[PASS] '
            : output.failureReason === ResultFailureReason.ASSERT
              ? '[FAIL] '
              : '[ERROR] ') + (output.text || ''),
          // Add grader reason
          output.gradingResult?.reason || '',
          // Add comment
          output.gradingResult?.comment || '',
        ];

        if (isRedteam && output.metadata) {
          for (const column of Object.keys(REDTEAM_METADATA_KEYS_TO_CSV_COLUMN_NAMES)) {
            const value = output.metadata[column];
            if (value === null || value === undefined) {
              baseValues.push('');
            } else if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            ) {
              // Don't stringify primitives - add them directly
              baseValues.push(value.toString());
            } else {
              // Stringify objects and arrays
              baseValues.push(JSON.stringify(value));
            }
          }
        } else if (isRedteam) {
          baseValues.push(...Array(REDTEAM_METADATA_COLUMNS.length).fill(''));
        }

        return baseValues;
      }),
    ];
    csvRows.push(rowValues);
  });

  return csvStringify(csvRows);
}

/**
 * Generate JSON data from evaluation table
 * @param table Evaluation table data
 * @returns JSON object
 */
export function evalTableToJson(table: {
  head: { prompts: Prompt[]; vars: string[] };
  body: EvaluateTableRow[];
}): any {
  return table;
}
