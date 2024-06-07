import Table from 'cli-table3';
import chalk from 'chalk';
import type { EvaluateSummary } from './types';

function ellipsize(str: string, maxLen: number) {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 3) + '...';
  }
  return str;
}

export function generateTable(summary: EvaluateSummary, tableCellMaxLength = 250, maxRows = 25) {
  const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
  const head = summary.table.head;
  const headLength = head.prompts.length + head.vars.length;
  const table = new Table({
    head: [
      ...head.vars,
      ...head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ].map((h) => ellipsize(h, tableCellMaxLength)),
    colWidths: Array(headLength).fill(Math.floor(maxWidth / headLength)),
    wordWrap: true,
    wrapOnWordBoundary: true, // if false, ansi colors break
    style: {
      head: ['blue', 'bold'],
    },
  });
  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of summary.table.body.slice(0, maxRows)) {
    table.push([
      ...row.vars.map((v) => ellipsize(v, tableCellMaxLength)),
      ...row.outputs.map(({ pass, score, text }) => {
        text = ellipsize(text, tableCellMaxLength);
        if (pass) {
          return chalk.green('[PASS] ') + text;
        } else if (!pass) {
          // color everything red up until '---'
          return (
            chalk.red('[FAIL] ') +
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

export function wrapTable(rows: Record<string, string | number>[]) {
  const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
  const head = Object.keys(rows[0]);
  const table = new Table({
    head,
    colWidths: Array(head.length).fill(Math.floor(maxWidth / head.length)),
    wordWrap: true,
    wrapOnWordBoundary: true,
  });
  for (const row of rows) {
    table.push(Object.values(row));
  }
  return table;
}
