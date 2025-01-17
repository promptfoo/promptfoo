import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import { ResultFailureReason, type EvaluateTable } from './types';
import { ellipsize } from './utils/text';

export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength = 250,
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

export function wrapTable(rows: Record<string, string | number>[]) {
  if (rows.length === 0) {
    return 'No data to display';
  }
  const head = Object.keys(rows[0]);
  const table = new Table({
    head,
    colWidths: Array(head.length).fill(Math.floor(TERMINAL_MAX_WIDTH / head.length)),
    wordWrap: true,
    wrapOnWordBoundary: true,
  });
  for (const row of rows) {
    table.push(Object.values(row));
  }
  return table;
}
