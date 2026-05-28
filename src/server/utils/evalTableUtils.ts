import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types/index';

import type Eval from '../../models/eval';
import type {
  CompletedPrompt,
  EvalResultsFilterMode,
  EvalTableDTO,
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

export const STRIPPED_TABLE_CELL_PROMPT = '';

export type EvalTableOutputPromptLocation = {
  rowIndex: number;
  outputIndex: number;
  length: number;
};

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

function formatNamedScoreValue(value: number | undefined): string {
  return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(2) : '';
}

/**
 * Build a per-prompt list of `Metric: <name>` column names, deduplicated and
 * sorted with `localeCompare`. Shared shell for both the row-scanning helper
 * (WebUI path) and the aggregate-reading helper (streaming CLI path); see the
 * two call sites below.
 */
function collectMetricNamesByPrompt<T>(
  items: T[],
  namesFor: (item: T, index: number) => Iterable<string>,
): string[][] {
  return items.map((item, index) =>
    [...new Set(namesFor(item, index))].sort((a, b) => a.localeCompare(b)),
  );
}

/**
 * Collect per-row named metric names by scanning row outputs. Used by the
 * non-streaming WebUI export, which has the full table in memory.
 *
 * Returns one sorted name list per prompt, aligned with `table.head.prompts`.
 * Names whose only values are non-numeric or NaN are skipped so we don't emit
 * blank columns for invalid data.
 */
function collectNamedScoreNamesByPrompt(table: {
  head: { prompts: Prompt[]; vars: string[] };
  body: EvaluateTableRow[];
}): string[][] {
  return collectMetricNamesByPrompt(table.head.prompts, (_, promptIndex) => {
    const names: string[] = [];
    for (const row of table.body) {
      const namedScores = row.outputs[promptIndex]?.namedScores;
      if (!namedScores) {
        continue;
      }
      for (const [name, value] of Object.entries(namedScores)) {
        if (typeof value === 'number' && !Number.isNaN(value)) {
          names.push(name);
        }
      }
    }
    return names;
  });
}

/**
 * Collect per-row named metric names from prompt-level aggregate metrics, for
 * use by the streaming CSV path which cannot scan rows up front.
 *
 * Uses `namedScoresCount` because it is incremented only when a per-row
 * result contributes a metric (`src/util/namedMetrics.ts`). Derived metrics
 * write to `namedScores` but not `namedScoresCount` (`src/evaluator.ts`
 * `updateDerivedMetrics`), so this keeps the streaming column set aligned
 * with what `collectNamedScoreNamesByPrompt` would produce from row outputs.
 *
 * Returns an empty list for prompts whose count map is missing or empty;
 * the streaming caller backfills those by scanning first-batch row outputs,
 * which naturally excludes derived metrics (they never appear on rows).
 */
function collectNamedScoreNamesByPromptFromAggregate(prompts: Prompt[]): string[][] {
  return collectMetricNamesByPrompt(prompts, (prompt) => {
    const counts = (prompt as CompletedPrompt).metrics?.namedScoresCount;
    if (!counts) {
      return [];
    }
    return Object.keys(counts).filter((name) => (counts[name] ?? 0) > 0);
  });
}

/**
 * Collect per-row metric names from a single batch of row outputs for one
 * prompt index. Used by `streamEvalCsv` to backfill prompts whose aggregate
 * `namedScoresCount` is missing or empty (legacy evals, external imports).
 *
 * Mirrors the filtering in `collectNamedScoreNamesByPrompt` so the streaming
 * CSV column set matches the WebUI CSV column set for the same prompt.
 */
function collectMetricNamesFromRowOutputs(
  rows: Array<{ outputs: Array<{ namedScores?: Record<string, number> } | null | undefined> }>,
  promptIndex: number,
): string[] {
  const names: string[] = [];
  for (const row of rows) {
    const namedScores = row.outputs[promptIndex]?.namedScores;
    if (!namedScores) {
      continue;
    }
    for (const [name, value] of Object.entries(namedScores)) {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        names.push(name);
      }
    }
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Backfill empty per-prompt metric name lists in-place by scanning the rows
 * passed in. Called by `streamEvalCsv` after buffering every batch when the
 * aggregate `namedScoresCount` was missing, so legacy evals (and external
 * imports) get the same metric columns the WebUI CSV would emit, without
 * re-introducing derived metrics (which never land on row outputs).
 */
function backfillMetricNamesFromRows(
  namedScoreNamesByPrompt: string[][],
  rows: Array<{ outputs: Array<{ namedScores?: Record<string, number> } | null | undefined> }>,
): void {
  for (let promptIndex = 0; promptIndex < namedScoreNamesByPrompt.length; promptIndex++) {
    if (namedScoreNamesByPrompt[promptIndex].length === 0) {
      namedScoreNamesByPrompt[promptIndex] = collectMetricNamesFromRowOutputs(rows, promptIndex);
    }
  }
}

type StreamRow = {
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
  } | null>;
  test: { description?: string };
};

/**
 * Convert a batch of `EvalResult` rows (grouped by testIdx) into the table-row
 * shape that `tableRowToCsvValues` accepts. Used by `streamEvalCsv` to keep its
 * per-batch processing tight; the outputs array is pre-sized so columns line up
 * with prompts even when results arrive out of promptIdx order.
 */
function batchToStreamRows(
  batchResults: Iterable<{
    testIdx: number;
    promptIdx: number;
    testCase?: { vars?: Record<string, unknown>; description?: string };
    response?: { output?: string };
    success: boolean;
    score?: number;
    namedScores?: Record<string, number>;
    failureReason?: ResultFailureReason;
    gradingResult?: { reason?: string; comment?: string } | null;
    metadata?: Record<string, unknown>;
  }>,
  varNames: string[],
  numPrompts: number,
): StreamRow[] {
  const rowsByTestIdx = new Map<number, StreamRow>();
  for (const result of batchResults) {
    let row = rowsByTestIdx.get(result.testIdx);
    if (!row) {
      row = {
        testIdx: result.testIdx,
        vars: varNames.map((varName) => {
          const value = result.testCase?.vars?.[varName];
          return value === undefined ? '' : String(value);
        }),
        outputs: new Array(numPrompts).fill(null),
        test: { description: result.testCase?.description },
      };
      rowsByTestIdx.set(result.testIdx, row);
    }
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
  return Array.from(rowsByTestIdx.values());
}

/**
 * Build CSV headers for an evaluation table.
 *
 * @param vars - Variable names from the table head
 * @param prompts - Prompt definitions from the table head
 * @param options - Export options
 * @param options.namedScoreNamesByPrompt - Named metric names that should get
 *   dedicated `Metric: <name>` columns, one sorted list per prompt (aligned
 *   with `prompts`). Must match the value passed to `tableRowToCsvValues` so
 *   header and row column counts stay in sync.
 * @returns Array of header strings
 */
export function buildCsvHeaders(
  vars: string[],
  prompts: Prompt[],
  options: {
    hasDescriptions?: boolean;
    isRedteam?: boolean;
    namedScoreNamesByPrompt?: string[][];
  } = {},
): string[] {
  const headers: string[] = [
    ...(options.hasDescriptions ? ['Description'] : []),
    ...vars,
    ...prompts.flatMap((prompt, promptIndex) => {
      const provider = (prompt as CompletedPrompt).provider || '';
      const label = provider ? `[${provider}] ${prompt.label}` : prompt.label;
      const metricColumns = (options.namedScoreNamesByPrompt?.[promptIndex] || []).map(
        (name) => `Metric: ${name}`,
      );
      return [
        label,
        'Status',
        'Score',
        'Named Scores',
        ...metricColumns,
        'Grader Reason',
        'Comment',
      ];
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
 * @param options - Export options (`namedScoreNamesByPrompt` must match the
 *   array passed to `buildCsvHeaders`)
 * @returns Array of values for the CSV row
 */
export function tableRowToCsvValues(
  row: EvaluateTableRow,
  options: {
    hasDescriptions?: boolean;
    isRedteam?: boolean;
    namedScoreNamesByPrompt?: string[][];
  } = {},
): (string | number | boolean)[] {
  const rowValues: (string | number | boolean)[] = [
    ...(options.hasDescriptions ? [row.test.description || ''] : []),
    ...row.vars,
    ...row.outputs.flatMap((output, outputIndex) => {
      const namedScoreNames = options.namedScoreNamesByPrompt?.[outputIndex] || [];
      if (!output) {
        return ['', '', '', '', ...namedScoreNames.map(() => ''), '', ''];
      }

      const status = getOutputStatus(output);
      const score = output.score?.toFixed(2) ?? '';
      const namedScores = formatNamedScores(output.namedScores);
      const namedScoreValues = namedScoreNames.map((name) =>
        formatNamedScoreValue(output.namedScores?.[name]),
      );

      return [
        output.text || '',
        status,
        score,
        namedScores,
        ...namedScoreValues,
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
 * - Metric: <name>: One dedicated column per distinct per-row named score,
 *   sorted alphabetically by name. Empty when a row has no value for that
 *   metric. Derived metrics are intentionally omitted (they live on the
 *   aggregate prompt metrics, not on individual rows).
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

  const namedScoreNamesByPrompt = collectNamedScoreNamesByPrompt(table);
  const headers = buildCsvHeaders(table.head.vars, table.head.prompts, {
    hasDescriptions,
    isRedteam,
    namedScoreNamesByPrompt,
  });

  const csvRows = [
    headers,
    ...table.body.map((row) =>
      tableRowToCsvValues(row, { hasDescriptions, isRedteam, namedScoreNamesByPrompt }),
    ),
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

export function getEvalTableOutputPromptLocationsBySize(
  payload: EvalTableDTO,
): EvalTableOutputPromptLocation[] {
  return payload.table.body
    .flatMap((row, rowIndex) =>
      row.outputs.flatMap((output, outputIndex) =>
        output?.prompt
          ? [
              {
                rowIndex,
                outputIndex,
                length: output.prompt.length,
              },
            ]
          : [],
      ),
    )
    .sort((a, b) => b.length - a.length);
}

function stripEvalTableOutputPrompts(
  payload: EvalTableDTO,
  locationsToStrip: Set<string>,
): EvalTableDTO {
  return {
    ...payload,
    table: {
      ...payload.table,
      body: payload.table.body.map((row, rowIndex) => ({
        ...row,
        outputs: row.outputs.map((output, outputIndex) => {
          if (!output || !locationsToStrip.has(`${rowIndex}:${outputIndex}`)) {
            return output;
          }
          return { ...output, prompt: STRIPPED_TABLE_CELL_PROMPT };
        }),
      })),
    },
  } as EvalTableDTO;
}

export function getEvalTablePromptStrippedPayload(
  payload: EvalTableDTO,
  promptLocations: EvalTableOutputPromptLocation[],
  promptCountToStrip: number,
): EvalTableDTO {
  const locationsToStrip = new Set(
    promptLocations
      .slice(0, promptCountToStrip)
      .map(({ rowIndex, outputIndex }) => `${rowIndex}:${outputIndex}`),
  );
  return stripEvalTableOutputPrompts(payload, locationsToStrip);
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
  // Derive metric column names from `namedScoresCount` so derived/aggregate-only
  // metrics don't introduce columns that the WebUI path would omit.
  const namedScoreNamesByPrompt = collectNamedScoreNamesByPromptFromAggregate(prompts);
  // Legacy evals and external imports may persist `metrics.namedScores` without
  // a matching `namedScoresCount`, so the aggregate read returns an empty list
  // for those prompts. We can't trust the first batch alone — `EvalResult`
  // batches are slices of `testIdx` ranges (default 100), so a metric that first
  // appears past testIdx 99 would be missed. Buffer every batch into memory in
  // this case, then derive metric names from the full row set (the same source
  // the WebUI path uses), keeping CSVs identical at the cost of streaming.
  const needsRowScanFallback = namedScoreNamesByPrompt.some((names) => names.length === 0);

  // Track whether we've written headers yet
  let headersWritten = false;
  let hasDescriptions = false;

  // Buffer to accumulate the first batch while we determine hasDescriptions.
  // When `needsRowScanFallback` is true, this buffer holds ALL batches instead
  // so we can scan rows for metric names before emitting headers.
  let firstBatchBuffer: StreamRow[] | null = null;

  for await (const batchResults of eval_.fetchResultsBatched()) {
    const rows = batchToStreamRows(batchResults, varNames, numPrompts);

    // Legacy fallback: hold every batch in memory so we can scan the full row
    // set for metric names before writing headers. The post-loop block below
    // emits headers + all buffered rows in one go.
    if (needsRowScanFallback) {
      firstBatchBuffer = firstBatchBuffer ? firstBatchBuffer.concat(rows) : rows;
      continue;
    }

    // On first batch, determine hasDescriptions and write headers
    if (!headersWritten) {
      hasDescriptions = rows.some((r) => r.test.description);
      const headers = buildCsvHeaders(varNames, prompts, {
        hasDescriptions,
        isRedteam,
        namedScoreNamesByPrompt,
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
        tableRowToCsvValues(row as unknown as EvaluateTableRow, {
          hasDescriptions,
          isRedteam,
          namedScoreNamesByPrompt,
        }),
      );
      if (bufferedCsvRows.length > 0) {
        await write(csvStringify(bufferedCsvRows));
      }
      firstBatchBuffer = null;
    }

    // Convert to CSV rows and write
    const csvRows = rows.map((row) =>
      tableRowToCsvValues(row as unknown as EvaluateTableRow, {
        hasDescriptions,
        isRedteam,
        namedScoreNamesByPrompt,
      }),
    );

    if (csvRows.length > 0) {
      await write(csvStringify(csvRows));
    }
  }

  // Legacy fallback: scan the fully-buffered row set for metric names so the
  // streaming CSV emits the same columns the WebUI exporter would, then emit
  // headers and rows in one go.
  if (needsRowScanFallback) {
    const rows = firstBatchBuffer ?? [];
    hasDescriptions = rows.some((r) => r.test.description);
    backfillMetricNamesFromRows(namedScoreNamesByPrompt, rows);
    const headers = buildCsvHeaders(varNames, prompts, {
      hasDescriptions,
      isRedteam,
      namedScoreNamesByPrompt,
    });
    await write(csvStringify([headers]));
    if (rows.length > 0) {
      const csvRows = rows.map((row) =>
        tableRowToCsvValues(row as unknown as EvaluateTableRow, {
          hasDescriptions,
          isRedteam,
          namedScoreNamesByPrompt,
        }),
      );
      await write(csvStringify(csvRows));
    }
    return;
  }

  // Handle case where we only had one batch and it was buffered
  if (firstBatchBuffer !== null) {
    const bufferedCsvRows = firstBatchBuffer.map((row) =>
      tableRowToCsvValues(row as unknown as EvaluateTableRow, {
        hasDescriptions,
        isRedteam,
        namedScoreNamesByPrompt,
      }),
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
      namedScoreNamesByPrompt,
    });
    await write(csvStringify([headers]));
  }
}
