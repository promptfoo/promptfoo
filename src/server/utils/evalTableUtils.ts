import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types/index';

import type Eval from '../../models/eval';
import type {
  CompletedPrompt,
  EvalResultsFilterMode,
  EvaluateTableRow,
  Prompt,
} from '../../types/index';

/**
 * Type representing the table page result from eval.getTablePage().
 * This differs from EvaluateTable in that it uses Prompt[] instead of CompletedPrompt[].
 */
export type TablePageResult = {
  head: { prompts: Prompt[]; vars: string[] };
  body: EvaluateTableRow[];
};

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
  /**
   * Function to find an eval by ID. Required for comparison exports.
   * Pass Eval.findById when calling from server routes.
   * If not provided, comparison exports will throw an error.
   */
  findEvalById?: (id: string) => Promise<Eval | null | undefined>;
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
 * Build CSV headers for an evaluation table.
 *
 * @param vars - Variable names from the table head
 * @param prompts - Prompt definitions from the table head
 * @param options - Export options
 * @returns Array of header strings
 */
export function buildCsvHeaders(
  vars: string[],
  prompts: Prompt[],
  options: { hasDescriptions?: boolean; isRedteam?: boolean } = {},
): string[] {
  const headers: string[] = [
    ...(options.hasDescriptions ? ['Description'] : []),
    ...vars,
    ...prompts.flatMap((prompt) => {
      const provider = (prompt as CompletedPrompt).provider || '';
      const label = provider ? `[${provider}] ${prompt.label}` : prompt.label;
      return [label, 'Status', 'Score', 'Named Scores', 'Grader Reason', 'Comment'];
    }),
  ];

  if (options.isRedteam) {
    headers.push(...REDTEAM_METADATA_COLUMNS);
  }

  return headers;
}

/**
 * Convert a single table row to CSV row values.
 *
 * @param row - The table row to convert
 * @param options - Export options
 * @returns Array of values for the CSV row
 */
export function tableRowToCsvValues(
  row: EvaluateTableRow,
  options: { hasDescriptions?: boolean; isRedteam?: boolean } = {},
): (string | number | boolean)[] {
  const rowValues: (string | number | boolean)[] = [
    ...(options.hasDescriptions ? [row.test.description || ''] : []),
    ...row.vars,
    ...row.outputs.flatMap((output) => {
      if (!output) {
        return ['', '', '', '', '', ''];
      }

      const status = getOutputStatus(output);
      const score = output.score?.toFixed(2) ?? '';
      const namedScores = formatNamedScores(output.namedScores);

      return [
        output.text || '',
        status,
        score,
        namedScores,
        output.gradingResult?.reason || '',
        output.gradingResult?.comment || '',
      ];
    }),
  ];

  // Add redteam metadata once per row (using first output's metadata)
  if (options.isRedteam) {
    const redteamKeys = Object.keys(REDTEAM_METADATA_KEYS_TO_CSV_COLUMN_NAMES);
    const firstOutputMetadata = row.outputs[0]?.metadata;
    for (const key of redteamKeys) {
      let value = firstOutputMetadata?.[key];
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
        rowValues.push(value.toString());
      } else {
        rowValues.push(JSON.stringify(value));
      }
    }
  }

  return rowValues;
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
  const { isRedteam } = options;
  const hasDescriptions = table.body.some((row) => row.test.description);

  const headers = buildCsvHeaders(table.head.vars, table.head.prompts, {
    hasDescriptions,
    isRedteam,
  });

  const csvRows = [
    headers,
    ...table.body.map((row) => tableRowToCsvValues(row, { hasDescriptions, isRedteam })),
  ];

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
 * @param comparisonData - Array of comparison eval data (eval ID and table)
 * @returns Merged table with all prompts and outputs combined
 */
export function mergeComparisonTables(
  mainEvalId: string,
  mainTable: TablePageResult,
  comparisonData: Array<{ evalId: string; table: TablePageResult }>,
): TablePageResult {
  return {
    head: {
      prompts: [
        // Main eval prompts with eval ID prefix
        ...mainTable.head.prompts.map((prompt) => ({
          ...prompt,
          label: `[${mainEvalId}] ${prompt.label || ''}`,
        })),
        // Comparison eval prompts with their eval ID prefixes
        ...comparisonData.flatMap(({ evalId, table }) =>
          table.head.prompts.map((prompt) => ({
            ...prompt,
            label: `[${evalId}] ${prompt.label || ''}`,
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
 * Used by WebUI for CSV downloads (with or without comparison evals).
 * For CLI exports, use `streamEvalCsv` which is more memory-efficient
 * for large datasets.
 *
 * Both functions use the same underlying formatting (`evalTableToCsv`,
 * `buildCsvHeaders`, `tableRowToCsvValues`) to ensure consistent output.
 *
 * @param eval_ - The evaluation to export
 * @param options - Export options including filters and comparison eval IDs
 * @returns CSV formatted string
 * @throws ComparisonEvalNotFoundError if a comparison eval ID is not found
 * @throws Error if comparison exports requested without findEvalById callback
 */
export async function generateEvalCsv(
  eval_: Eval,
  options: GenerateEvalCsvOptions = {},
): Promise<string> {
  const UNLIMITED_RESULTS = Number.MAX_SAFE_INTEGER;

  // Fetch main table
  const mainTable = await eval_.getTablePage({
    offset: 0,
    limit: UNLIMITED_RESULTS,
    filterMode: options.filterMode,
    searchQuery: options.searchQuery,
    filters: options.filters,
  });

  let finalTable: TablePageResult = mainTable;

  // Handle comparison evals if provided
  if (options.comparisonEvalIds && options.comparisonEvalIds.length > 0) {
    if (!options.findEvalById) {
      throw new Error(
        'findEvalById callback is required for comparison exports. ' +
          'Pass Eval.findById when calling from server routes.',
      );
    }

    const indices = mainTable.body.map((row) => row.testIdx);

    // Fetch comparison evals and their tables
    const comparisonData = await Promise.all(
      options.comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval = await options.findEvalById!(comparisonEvalId);
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

        return { evalId: comparisonEval.id, table };
      }),
    );

    // Merge tables for comparison export
    finalTable = mergeComparisonTables(eval_.id, mainTable, comparisonData);
  }

  return evalTableToCsv(finalTable, {
    isRedteam: Boolean(eval_.config.redteam),
  });
}

/**
 * Options for streaming CSV export.
 */
export interface StreamCsvOptions {
  /** Whether this is a redteam eval */
  isRedteam?: boolean;
  /** Callback to write a chunk of CSV data */
  write: (data: string) => void | Promise<void>;
}

/**
 * Stream CSV data from an evaluation in batches.
 *
 * This is more memory-efficient for large evaluations as it processes
 * results in batches rather than loading everything into memory.
 *
 * Used by the CLI export (`promptfoo eval -o output.csv`) to maintain
 * consistent CSV format with WebUI exports while handling large datasets.
 *
 * @param eval_ - The evaluation to export
 * @param options - Streaming options including the write callback
 */
export async function streamEvalCsv(eval_: Eval, options: StreamCsvOptions): Promise<void> {
  const { isRedteam = false, write } = options;
  const varNames = eval_.vars;
  const prompts = eval_.prompts;
  const numPrompts = prompts.length;

  // Track whether we've written headers yet
  let headersWritten = false;
  let hasDescriptions = false;

  // Buffer to accumulate the first batch while we determine hasDescriptions
  let firstBatchBuffer: Array<{
    testIdx: number;
    vars: string[];
    outputs: Array<{
      text: string;
      pass: boolean;
      score?: number;
      namedScores?: Record<string, number>;
      failureReason?: ResultFailureReason;
      gradingResult?: { reason?: string; comment?: string } | null;
      metadata?: Record<string, unknown>;
    }>;
    test: { description?: string };
  }> | null = null;

  for await (const batchResults of eval_.fetchResultsBatched()) {
    // Group results by testIdx to reconstruct table rows
    const rowsByTestIdx = new Map<
      number,
      {
        testIdx: number;
        vars: string[];
        outputs: Array<{
          text: string;
          pass: boolean;
          score?: number;
          namedScores?: Record<string, number>;
          failureReason?: ResultFailureReason;
          gradingResult?: { reason?: string; comment?: string } | null;
          metadata?: Record<string, unknown>;
        }>;
        test: { description?: string };
      }
    >();

    for (const result of batchResults) {
      if (!rowsByTestIdx.has(result.testIdx)) {
        // Pre-allocate outputs array with correct size for all prompts
        // This ensures outputs align with prompt columns regardless of result order
        rowsByTestIdx.set(result.testIdx, {
          testIdx: result.testIdx,
          vars: varNames.map((varName) => {
            const value = result.testCase?.vars?.[varName];
            return value !== undefined ? String(value) : '';
          }),
          outputs: new Array(numPrompts).fill(null),
          test: { description: result.testCase?.description },
        });
      }
      const row = rowsByTestIdx.get(result.testIdx)!;
      // Use promptIdx to position output correctly (matches prompt column order)
      row.outputs[result.promptIdx] = {
        text: result.response?.output ?? '',
        pass: result.success,
        score: result.score,
        namedScores: result.namedScores,
        failureReason: result.failureReason,
        gradingResult: result.gradingResult,
        metadata: result.metadata,
      };
    }

    const rows = Array.from(rowsByTestIdx.values());

    // On first batch, determine hasDescriptions and write headers
    if (!headersWritten) {
      hasDescriptions = rows.some((r) => r.test.description);
      const headers = buildCsvHeaders(varNames, prompts, {
        hasDescriptions,
        isRedteam,
      });
      await write(csvStringify([headers]));
      headersWritten = true;

      // Check if we need to scan more batches for descriptions
      // If first batch has no descriptions, buffer it and check subsequent batches
      if (!hasDescriptions) {
        firstBatchBuffer = rows;
        continue;
      }
    }

    // If we had buffered the first batch (because it had no descriptions),
    // check if this batch has descriptions. If so, we need to restart with correct headers.
    if (firstBatchBuffer !== null) {
      const thisHasDescriptions = rows.some((r) => r.test.description);
      if (thisHasDescriptions && !hasDescriptions) {
        // We found descriptions in a later batch but already wrote headers without Description column.
        // This is an edge case - for streaming we accept this limitation and continue without Description.
        // A warning could be logged here if desired.
      }
      // Write the buffered first batch
      const bufferedCsvRows = firstBatchBuffer.map((row) =>
        tableRowToCsvValues(row as unknown as EvaluateTableRow, { hasDescriptions, isRedteam }),
      );
      if (bufferedCsvRows.length > 0) {
        await write(csvStringify(bufferedCsvRows));
      }
      firstBatchBuffer = null;
    }

    // Convert to CSV rows and write
    const csvRows = rows.map((row) =>
      tableRowToCsvValues(row as unknown as EvaluateTableRow, { hasDescriptions, isRedteam }),
    );

    if (csvRows.length > 0) {
      await write(csvStringify(csvRows));
    }
  }

  // Handle case where we only had one batch and it was buffered
  if (firstBatchBuffer !== null) {
    const bufferedCsvRows = firstBatchBuffer.map((row) =>
      tableRowToCsvValues(row as unknown as EvaluateTableRow, { hasDescriptions, isRedteam }),
    );
    if (bufferedCsvRows.length > 0) {
      await write(csvStringify(bufferedCsvRows));
    }
  }

  // Handle case where there were no results at all - still write headers
  if (!headersWritten) {
    const headers = buildCsvHeaders(varNames, prompts, {
      hasDescriptions: false,
      isRedteam,
    });
    await write(csvStringify([headers]));
  }
}
