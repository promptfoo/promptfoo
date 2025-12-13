import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types/index';

import type Eval from '../../models/eval';
import type {
  CompletedPrompt,
  EvalResultsFilterMode,
  EvaluateTable,
  EvaluateTableRow,
  Prompt,
} from '../../types/index';

/**
 * Options for generating CSV from an evaluation.
 */
export interface GenerateEvalCsvOptions {
  /** Filter mode for results (all, passes, failures, errors, highlights) */
  filterMode?: EvalResultsFilterMode;
  /** Search query to filter results */
  searchQuery?: string;
  /** Additional filter conditions */
  filters?: string[];
  /** Comparison eval IDs for side-by-side comparison exports */
  comparisonEvalIds?: string[];
}

/**
 * Error thrown when a comparison eval is not found.
 */
export class ComparisonEvalNotFoundError extends Error {
  constructor(evalId: string) {
    super(`Comparison eval not found: ${evalId}`);
    this.name = 'ComparisonEvalNotFoundError';
  }
}

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
}): unknown {
  return table;
}

/**
 * Merges comparison tables with the main table for side-by-side CSV export.
 *
 * @param mainEvalId - The ID of the main evaluation
 * @param mainTable - The main evaluation table
 * @param comparisonData - Array of comparison eval data (eval object and table)
 * @returns Merged table with all prompts and outputs combined
 */
function mergeComparisonTables(
  mainEvalId: string,
  mainTable: EvaluateTable,
  comparisonData: Array<{ eval_: Eval; table: EvaluateTable }>,
): EvaluateTable {
  return {
    head: {
      prompts: [
        // Main eval prompts with eval ID prefix
        ...mainTable.head.prompts.map((prompt) => ({
          ...prompt,
          label: `[${mainEvalId}] ${prompt.label || ''}`,
        })),
        // Comparison eval prompts with their eval ID prefixes
        ...comparisonData.flatMap(({ table }) =>
          table.head.prompts.map((prompt) => ({
            ...prompt,
            label: `[${table.id}] ${prompt.label || ''}`,
          })),
        ),
      ],
      vars: mainTable.head.vars,
    },
    body: mainTable.body.map((row) => {
      const testIdx = row.testIdx;
      // Find matching rows in comparison tables by test index
      const matchingRows = comparisonData
        .map(({ table }) => table.body.find((compRow) => compRow.testIdx === testIdx))
        .filter((r): r is EvaluateTableRow => r !== undefined);

      return {
        ...row,
        outputs: [...row.outputs, ...matchingRows.flatMap((r) => r.outputs)],
      };
    }),
  };
}

/**
 * High-level function to generate CSV from an evaluation.
 *
 * This is the single source of truth for ALL CSV generation, used by both:
 * - CLI: `promptfoo eval -o output.csv` and `promptfoo export eval`
 * - WebUI: Download CSV button (with or without comparison evals)
 *
 * Handles both simple exports and comparison exports with multiple evaluations.
 *
 * @param eval_ - The evaluation to export
 * @param options - Export options including filters and comparison eval IDs
 * @returns CSV formatted string
 * @throws ComparisonEvalNotFoundError if a comparison eval ID is not found
 */
export async function generateEvalCsv(
  eval_: Eval,
  options: GenerateEvalCsvOptions = {},
): Promise<string> {
  // Import Eval dynamically to avoid circular dependencies
  const { default: EvalModel } = await import('../../models/eval');

  const UNLIMITED_RESULTS = Number.MAX_SAFE_INTEGER;

  // Fetch main table
  const mainTable = await eval_.getTablePage({
    offset: 0,
    limit: UNLIMITED_RESULTS,
    filterMode: options.filterMode,
    searchQuery: options.searchQuery,
    filters: options.filters,
  });

  let finalTable: EvaluateTable = mainTable;

  // Handle comparison evals if provided
  if (options.comparisonEvalIds && options.comparisonEvalIds.length > 0) {
    const indices = mainTable.body.map((row) => row.testIdx);

    // Fetch comparison evals and their tables
    const comparisonData = await Promise.all(
      options.comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval = await EvalModel.findById(comparisonEvalId);
        if (!comparisonEval) {
          throw new ComparisonEvalNotFoundError(comparisonEvalId);
        }

        const table = await comparisonEval.getTablePage({
          offset: 0,
          limit: indices.length,
          filterMode: 'all',
          testIndices: indices,
          searchQuery: options.searchQuery,
          filters: options.filters,
        });

        return { eval_: comparisonEval, table };
      }),
    );

    // Merge tables for comparison export
    finalTable = mergeComparisonTables(eval_.id, mainTable, comparisonData);
  }

  return evalTableToCsv(finalTable, {
    isRedteam: Boolean(eval_.config.redteam),
  });
}
