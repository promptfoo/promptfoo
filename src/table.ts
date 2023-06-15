import Table from 'cli-table3';
import chalk from 'chalk';
import type { EvaluateSummary } from './types';

export function generateTable(summary: EvaluateSummary, tableCellMaxLength = 250, maxRows = 25) {
  const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
  const head = summary.table.head;
  const headLength = head.prompts.length + head.vars.length;
  const table = new Table({
    head: [...head.prompts, ...head.vars],
    colWidths: Array(headLength).fill(Math.floor(maxWidth / headLength)),
    wordWrap: true,
    wrapOnWordBoundary: false,
    style: {
      head: ['blue', 'bold'],
    },
  });
  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of summary.table.body.slice(0, maxRows)) {
    table.push([
      ...row.vars,
      ...row.outputs.map((col) => {
        if (col.length > tableCellMaxLength) {
          col = col.slice(0, tableCellMaxLength) + '...';
        }
        if (col.startsWith('[PASS]')) {
          // color '[PASS]' green
          return chalk.green.bold(col.slice(0, 6)) + col.slice(6);
        } else if (col.startsWith('[FAIL]')) {
          // color everything red up until '---'
          return col
            .split('---')
            .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
            .join('---');
        }
        return col;
      }),
    ]);
  }
  return table;
}
