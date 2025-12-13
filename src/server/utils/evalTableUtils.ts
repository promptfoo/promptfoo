import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types/index';

import type { CompletedPrompt, EvaluateTableRow, Prompt } from '../../types/index';

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
 * Get the status string for an output
 */
function getOutputStatus(output: EvaluateTableRow['outputs'][0]): 'PASS' | 'FAIL' | 'ERROR' {
  if (output.pass) {
    return 'PASS';
  }
  return output.failureReason === ResultFailureReason.ASSERT ? 'FAIL' : 'ERROR';
}

/**
 * Format named scores for CSV output.
 * Returns empty string if no named scores, otherwise JSON string.
 */
function formatNamedScores(namedScores: Record<string, number> | undefined): string {
  if (!namedScores || Object.keys(namedScores).length === 0) {
    return '';
  }
  // Format as JSON for parseability, with scores rounded to 2 decimal places
  const rounded: Record<string, number> = {};
  for (const [key, value] of Object.entries(namedScores)) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      rounded[key] = Number(value.toFixed(2));
    }
  }
  if (Object.keys(rounded).length === 0) {
    return '';
  }
  return JSON.stringify(rounded);
}

/**
 * Generates CSV data from evaluation table data.
 *
 * Column structure per prompt:
 * - Output: Pure LLM output text (no pass/fail prefix)
 * - Status: PASS | FAIL | ERROR
 * - Score: Numeric score (e.g., "1.00")
 * - Named Scores: JSON object with per-assertion scores (e.g., {"clarity": 0.90, "accuracy": 0.85})
 * - Grader Reason: Explanation from the grader
 * - Comment: Additional grader comment
 *
 * This function is the single source of truth for CSV generation,
 * used by both the WebUI export and CLI export.
 *
 * @param table - The evaluation table data
 * @param options - Export options
 * @returns CSV formatted string
 */
export function evalTableToCsv(
  table: { head: { prompts: Prompt[]; vars: string[] }; body: EvaluateTableRow[] },
  options: { isRedteam?: boolean } = { isRedteam: false },
): string {
  const csvRows: unknown[][] = [];
  const { isRedteam } = options;

  // Check if any rows have descriptions
  const hasDescriptions = table.body.some((row) => row.test.description);

  // Create headers with columns for output, status, score, named scores, grader reason, and comment
  const headers: string[] = [
    ...(hasDescriptions ? ['Description'] : []),
    ...table.head.vars,
    ...table.head.prompts.flatMap((prompt) => {
      // Handle both Prompt and CompletedPrompt types
      const provider = (prompt as CompletedPrompt).provider || '';
      const label = provider ? `[${provider}] ${prompt.label}` : prompt.label;
      // Output column uses the prompt label, followed by metadata columns
      return [label, 'Status', 'Score', 'Named Scores', 'Grader Reason', 'Comment'];
    }),
  ];

  if (isRedteam) {
    headers.push(...REDTEAM_METADATA_COLUMNS);
  }
  csvRows.push(headers);

  // Compute stable key ordering for redteam metadata columns
  const redteamKeys = Object.keys(REDTEAM_METADATA_KEYS_TO_CSV_COLUMN_NAMES);

  // Process body rows with separate columns for output, status, score, named scores, etc.
  table.body.forEach((row) => {
    const rowValues = [
      ...(hasDescriptions ? [row.test.description || ''] : []),
      ...row.vars,
      ...row.outputs.flatMap((output) => {
        if (!output) {
          return ['', '', '', '', '', ''];
        }

        const status = getOutputStatus(output);
        const score = output.score?.toFixed(2) ?? '';
        const namedScores = formatNamedScores(output.namedScores);

        return [
          // Pure LLM output text (no prefix)
          output.text || '',
          // Status as separate column
          status,
          // Score as separate column
          score,
          // Named scores as JSON
          namedScores,
          // Grader reason
          output.gradingResult?.reason || '',
          // Comment
          output.gradingResult?.comment || '',
        ];
      }),
    ];

    // Add redteam metadata once per row (using first output's metadata)
    if (isRedteam) {
      const firstOutputMetadata = row.outputs[0]?.metadata;
      for (const key of redteamKeys) {
        let value = firstOutputMetadata?.[key];
        // Default strategyId to 'basic' for strategy-less tests
        if (key === 'strategyId' && (value === null || value === undefined)) {
          value = 'basic';
        }
        if (value === null || value === undefined) {
          rowValues.push('');
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          // Don't stringify primitives - add them directly
          rowValues.push(value.toString());
        } else {
          // Stringify objects and arrays
          rowValues.push(JSON.stringify(value));
        }
      }
    }

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
  // biome-ignore lint/suspicious/noExplicitAny: FIXME
}): any {
  return table;
}
