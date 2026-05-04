import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import { type EvaluateTable, ResultFailureReason } from './types/index';
import { ellipsize } from './util/text';

/**
 * Render eval table data as terminal-friendly text.
 *
 * Usually pass the table from a completed eval record returned by `evaluate()`.
 *
 * @example
 * ```ts
 * const evalRecord = await evaluate(testSuite);
 * console.log(generateTable(evalRecord.table));
 * ```
 *
 * @public
 */
export function generateTable(
  /** Table data returned on the completed eval record. */
  evaluateTable: EvaluateTable,
  /** Maximum visible width for each rendered cell. */
  tableCellMaxLength = 250,
  /** Maximum number of body rows to render. */
  maxRows = 25,
): string {
  const head = evaluateTable.head;
  const headLength = head.prompts.length + head.vars.length;
  const table = new Table({
    head: [
      ...head.vars,
      ...head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ].map((h) => ellipsize(h, tableCellMaxLength)),
    colWidths: Array(headLength).fill(Math.floor(TERMINAL_MAX_WIDTH / headLength)),
    wordWrap: true,
    wrapOnWordBoundary: true, // if false, ansi colors break
    style: {
      head: ['blue', 'bold'],
    },
  });
  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of evaluateTable.body.slice(0, maxRows)) {
    table.push([
      ...row.vars.map((v) => ellipsize(v, tableCellMaxLength)),
      ...row.outputs.map(({ pass, text, failureReason: failureType }) => {
        text = ellipsize(text, tableCellMaxLength);
        if (pass) {
          return chalk.green('[PASS] ') + text;
        }

        // Color everything red up until '---'.
        return (
          chalk.red(failureType === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
          text
            .split('---')
            .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
            .join('---')
        );
      }),
    ]);
  }
  return table.toString();
}

export function wrapTable(
  rows: Record<string, string | number>[],
  columnWidths?: Record<string, number>,
) {
  if (rows.length === 0) {
    return 'No data to display';
  }
  const head = Object.keys(rows[0]);

  // Calculate widths based on content and terminal width
  const defaultWidth = Math.floor(TERMINAL_MAX_WIDTH / head.length);
  const colWidths = head.map((column) => columnWidths?.[column] || defaultWidth);

  const table = new Table({
    head,
    colWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
  });
  for (const row of rows) {
    table.push(Object.values(row));
  }
  return table.toString();
}
