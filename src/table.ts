import Table from 'cli-table3';
import chalk from 'chalk';
import type { EvaluateSummary } from './types';

export function generateTable(summary: EvaluateSummary, tableCellMaxLength = 250, maxRows = 25) {
  const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
  const head = summary.table.head;
  const headLength = head.prompts.length + head.vars.length;
  const table = new Table({
    head: [...head.prompts.map((prompt) => prompt.display), ...head.vars],
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
      ...row.outputs.map(({ pass, score, text }) => {
        if (text.length > tableCellMaxLength) {
          text = text.slice(0, tableCellMaxLength) + '...';
        }
        if (pass) {
          return chalk.green.bold('[PASS] ') + text;
        } else if (!pass) {
          // color everything red up until '---'
          return (
            chalk.red.bold('[FAIL] ') +
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
  return table;
}
