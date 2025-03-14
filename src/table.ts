import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH, METADATA_PREFIX } from './constants';
import { ResultFailureReason, type EvaluateTable } from './types';
import { ellipsize } from './util/text';

export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength = 250,
  maxRows = 25,
): string {
  const head = evaluateTable.head;
  // Filter out metadata variables from the vars array
  const filteredVars = head.vars.filter((varName) => !varName.startsWith(METADATA_PREFIX));
  const headLength = head.prompts.length + filteredVars.length;
  const table = new Table({
    head: [
      ...filteredVars,
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
    // Filter out metadata variables from the vars array
    const filteredRowVars = row.vars.filter(
      (_, index) => !head.vars[index]?.startsWith(METADATA_PREFIX),
    );
    table.push([
      ...filteredRowVars.map((v) => ellipsize(v, tableCellMaxLength)),
      ...row.outputs.map(({ pass, score, text, failureReason: failureType }) => {
        text = ellipsize(text, tableCellMaxLength);
        if (pass) {
          return chalk.green('[PASS] ') + text;
        } else if (!pass) {
          // color everything red up until '---'
          return (
            chalk.red(failureType === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
            text
              .split('---')
              .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
              .join('---')
          );
        }
        return text;
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

  // Get head and filter out metadata columns
  const allColumns = Object.keys(rows[0]);
  const head = allColumns.filter((column) => !column.startsWith(METADATA_PREFIX));

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
    // Only include visible columns (not metadata columns)
    const visibleValues = head.map((column) => row[column]);
    table.push(visibleValues);
  }

  return table;
}
