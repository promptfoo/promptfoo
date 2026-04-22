import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import {
  type EvaluateTable,
  type EvaluateTableOutput,
  type GradingResult,
  ResultFailureReason,
} from './types/index';
import { ellipsize } from './util/text';

function getThresholdLabel(threshold: number | undefined, childCount?: number): string {
  if (threshold === undefined || threshold === 1) {
    return 'ALL must pass';
  }
  if (threshold === 0.5) {
    return 'Either/Or';
  }
  if (threshold > 0 && threshold < 0.5) {
    return 'At least one';
  }
  if (threshold > 0.5 && threshold < 1) {
    if (childCount) {
      return `Most must pass (${Math.ceil(threshold * childCount)}/${childCount})`;
    }
    return 'Most must pass';
  }
  return '';
}

function getAssertionMetric(result: GradingResult): string {
  return (
    result.assertion?.metric ||
    result.metadata?.assertSetMetric ||
    result.assertion?.type ||
    (result.metadata?.isAssertSet ? 'assert-set' : 'assertion')
  );
}

function formatTreePrefix(ancestorLastFlags: boolean[]): string {
  if (ancestorLastFlags.length === 0) {
    return '';
  }

  const prefix = ancestorLastFlags
    .slice(0, -1)
    .map((isLast) => (isLast ? '  ' : '│ '))
    .join('');
  return `${prefix}${ancestorLastFlags[ancestorLastFlags.length - 1] ? '└ ' : '├ '}`;
}

function formatAssertionResult(
  result: GradingResult,
  options: {
    parentPassed?: boolean;
    ancestorLastFlags?: boolean[];
  } = {},
): {
  metric: string;
  pass: string;
  score: string;
  weight: string;
  reason: string;
} {
  const { parentPassed, ancestorLastFlags = [] } = options;
  const passIndicator = result.pass
    ? chalk.green('✓')
    : parentPassed && ancestorLastFlags.length > 0
      ? chalk.gray('─')
      : chalk.red('✗');

  let metric = getAssertionMetric(result);
  if (result.metadata?.isAssertSet) {
    const thresholdLabel = getThresholdLabel(
      result.metadata.assertSetThreshold,
      result.metadata.childCount,
    );
    if (thresholdLabel) {
      metric = `${metric} (${thresholdLabel})`;
    }
  }

  let reason = result.reason || '';
  if (!result.pass && parentPassed && ancestorLastFlags.length > 0) {
    reason = `${reason} (not required)`;
  }

  return {
    metric: `${formatTreePrefix(ancestorLastFlags)}${metric}`,
    pass: passIndicator,
    score: result.score?.toFixed(2) || '0.00',
    weight: result.metadata?.assertSetWeight?.toString() || '-',
    reason: ellipsize(reason, 40),
  };
}

export function generateAssertionTable(output: EvaluateTableOutput): string {
  const componentResults = output.gradingResult?.componentResults;
  if (!componentResults || componentResults.length === 0) {
    return '';
  }

  const parentMap = new Map<number, { index: number; result: GradingResult }[]>();
  const topLevel: { index: number; result: GradingResult }[] = [];

  componentResults.forEach((result, index) => {
    if (!result) {
      return;
    }

    const parentIndex = result.metadata?.parentAssertSetIndex;
    if (parentIndex !== undefined && componentResults[parentIndex]) {
      const children = parentMap.get(parentIndex) ?? [];
      children.push({ index, result });
      parentMap.set(parentIndex, children);
    } else {
      topLevel.push({ index, result });
    }
  });

  const rows: ReturnType<typeof formatAssertionResult>[] = [];
  const renderResult = (
    item: { index: number; result: GradingResult },
    ancestorLastFlags: boolean[] = [],
    parentPassed?: boolean,
  ) => {
    rows.push(formatAssertionResult(item.result, { parentPassed, ancestorLastFlags }));

    const children = parentMap.get(item.index) ?? [];
    children.forEach((child, childIndex) => {
      renderResult(
        child,
        [...ancestorLastFlags, childIndex === children.length - 1],
        item.result.pass,
      );
    });
  };

  topLevel.forEach((item) => renderResult(item));

  if (rows.length === 0) {
    return '';
  }

  const table = new Table({
    head: ['Metric', 'Pass', 'Score', 'Weight', 'Reason'].map((h) => chalk.dim(h)),
    colWidths: [30, 6, 8, 8, 45],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: { head: [] },
  });

  for (const row of rows) {
    table.push([row.metric, row.pass, row.score, row.weight, row.reason]);
  }

  return table.toString();
}

export function generateAssertionSummary(output: EvaluateTableOutput): string {
  const componentResults = output.gradingResult?.componentResults;
  if (!componentResults || componentResults.length === 0) {
    return '';
  }

  return componentResults
    .filter((result) => result && result.metadata?.parentAssertSetIndex === undefined)
    .map((result) => {
      const name = getAssertionMetric(result);
      if (result.pass) {
        return chalk.green(`✓ ${name}`);
      }
      const score = result.score === undefined ? '' : ` (${result.score.toFixed(2)})`;
      return chalk.red(`✗ ${name}${score}`);
    })
    .join('  ');
}

function formatScoreThreshold(output: EvaluateTableOutput): string {
  const thresholdMatch = output.gradingResult?.reason?.match(/(\d+\.?\d*)\s*(?:≥|<)\s*(\d+\.?\d*)/);
  if (!thresholdMatch) {
    return '';
  }

  const score = Number.parseFloat(thresholdMatch[1]);
  const threshold = Number.parseFloat(thresholdMatch[2]);
  const color = output.gradingResult?.pass ? chalk.green : chalk.red;
  return color(
    `Score: ${(score * 100).toFixed(0)}% ${output.gradingResult?.pass ? '≥' : '<'} ${(
      threshold * 100
    ).toFixed(0)}% threshold`,
  );
}

export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength = 250,
  maxRows = 25,
  options?: { showAssertions?: boolean },
): string {
  const showAssertions = options?.showAssertions ?? false;
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
  const assertionTables: string[] = [];

  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of evaluateTable.body.slice(0, maxRows)) {
    const rowCells = [...row.vars.map((v) => ellipsize(v, tableCellMaxLength))];

    for (const output of row.outputs) {
      const text = ellipsize(output.text, tableCellMaxLength);
      let cellContent: string;

      if (output.pass) {
        cellContent = chalk.green('[PASS] ') + text;
      } else {
        cellContent =
          chalk.red(output.failureReason === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
          text
            .split('---')
            .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
            .join('---');

        const scoreThreshold = formatScoreThreshold(output);
        if (scoreThreshold) {
          cellContent += `\n       ${scoreThreshold}`;
        }

        const assertionSummary = generateAssertionSummary(output);
        if (assertionSummary) {
          cellContent += `\n       ${assertionSummary}`;
        }
      }

      rowCells.push(cellContent);

      if (showAssertions && output.gradingResult?.componentResults?.length) {
        assertionTables.push(generateAssertionTable(output));
      }
    }

    table.push(rowCells);
  }

  let result = table.toString();
  if (showAssertions && assertionTables.length > 0) {
    result += `\n\n${chalk.bold('Assertion Details:')}\n`;
    result += assertionTables.filter(Boolean).join('\n');
  }
  return result;
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
