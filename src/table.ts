import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import { type EvaluateTable, type EvaluateTableOutput, ResultFailureReason } from './types/index';
import { ellipsize } from './util/text';

import type { GradingResult } from './types/index';

/**
 * Get a human-readable label for an assert-set threshold
 */
function getThresholdLabel(threshold: number | undefined): string {
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
    return 'Most must pass';
  }
  return '';
}

/**
 * Format an assertion result for CLI display
 */
function formatAssertionResult(
  result: GradingResult,
  parentPassed?: boolean,
  indentLevel = 0,
): {
  metric: string;
  pass: string;
  score: string;
  weight: string;
  reason: string;
} {
  const indent = indentLevel > 0 ? '  '.repeat(indentLevel) : '';
  const prefix = indentLevel === 1 ? '├ ' : indentLevel > 1 ? '└ ' : '';

  // Determine the pass/fail indicator
  let passIndicator: string;
  if (result.pass) {
    passIndicator = chalk.green('✓');
  } else if (parentPassed && indentLevel > 0) {
    // Child "failed" but parent passed (e.g., in an OR group)
    passIndicator = chalk.gray('─');
  } else {
    passIndicator = chalk.red('✗');
  }

  // Get metric name (check assertSetMetric for assert-set aggregate results)
  let metric =
    result.assertion?.metric ||
    result.metadata?.assertSetMetric ||
    result.assertion?.type ||
    (result.metadata?.isAssertSet ? 'assert-set' : '');

  // Add threshold label for assert-sets
  if (result.metadata?.isAssertSet && result.metadata?.assertSetThreshold !== undefined) {
    const thresholdLabel = getThresholdLabel(result.metadata.assertSetThreshold);
    if (thresholdLabel) {
      metric = `${metric} (${thresholdLabel})`;
    }
  }

  // Format reason with additional context for failed children in passing parents
  let reason = result.reason || '';
  if (!result.pass && parentPassed && indentLevel > 0) {
    reason = `${reason} (not required)`;
  }

  return {
    metric: `${indent}${prefix}${metric}`,
    pass: passIndicator,
    score: result.score?.toFixed(2) || '0.00',
    weight: result.metadata?.assertSetWeight?.toString() || '-',
    reason: ellipsize(reason, 40),
  };
}

/**
 * Generate a table showing assertion details for a single output
 */
export function generateAssertionTable(output: EvaluateTableOutput): string {
  const componentResults = output.gradingResult?.componentResults;
  if (!componentResults || componentResults.length === 0) {
    return '';
  }

  // Build hierarchical display
  const rows: ReturnType<typeof formatAssertionResult>[] = [];

  // Group results by parent
  const parentMap = new Map<number, GradingResult[]>();
  const topLevel: { index: number; result: GradingResult }[] = [];

  componentResults.forEach((result, index) => {
    if (!result) {
      return;
    }

    const parentIndex = result.metadata?.parentAssertSetIndex;
    if (parentIndex !== undefined) {
      if (!parentMap.has(parentIndex)) {
        parentMap.set(parentIndex, []);
      }
      parentMap.get(parentIndex)!.push(result);
    } else {
      topLevel.push({ index, result });
    }
  });

  // Render top-level items with their children
  for (const { index, result } of topLevel) {
    const isAssertSet = result.metadata?.isAssertSet;
    rows.push(formatAssertionResult(result));

    // Add children if this is an assert-set
    if (isAssertSet) {
      const children = parentMap.get(index) || [];
      const parentPassed = result.pass;
      children.forEach((child, childIdx) => {
        const isLast = childIdx === children.length - 1;
        rows.push(formatAssertionResult(child, parentPassed, isLast ? 2 : 1));
      });
    }
  }

  if (rows.length === 0) {
    return '';
  }

  const table = new Table({
    head: ['Metric', 'Pass', 'Score', 'Weight', 'Reason'].map((h) => chalk.dim(h)),
    colWidths: [25, 6, 8, 8, 45],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: { head: [] },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
  });

  for (const row of rows) {
    table.push([row.metric, row.pass, row.score, row.weight, row.reason]);
  }

  return table.toString();
}

/**
 * Generate a compact inline summary of assertions
 */
export function generateAssertionSummary(output: EvaluateTableOutput): string {
  const componentResults = output.gradingResult?.componentResults;
  if (!componentResults || componentResults.length === 0) {
    return '';
  }

  // Filter to top-level assertions only (not children)
  const topLevelResults = componentResults.filter(
    (r) => r && r.metadata?.parentAssertSetIndex === undefined,
  );

  if (topLevelResults.length === 0) {
    return '';
  }

  const parts = topLevelResults.map((result) => {
    if (!result) {
      return '';
    }
    const name =
      result.assertion?.metric ||
      result.metadata?.assertSetMetric ||
      result.assertion?.type ||
      'assertion';
    if (result.pass) {
      return chalk.green(`✓ ${name}`);
    } else {
      const scoreStr = result.score !== undefined ? ` (${result.score.toFixed(2)})` : '';
      return chalk.red(`✗ ${name}${scoreStr}`);
    }
  });

  return parts.filter(Boolean).join('  ');
}

/**
 * Format the score vs threshold display
 */
function formatScoreThreshold(output: EvaluateTableOutput): string {
  const gradingResult = output.gradingResult;
  if (!gradingResult) {
    return '';
  }

  // Check if there's a threshold in the reason
  const thresholdMatch = gradingResult.reason?.match(/(\d+\.?\d*)\s*(?:≥|<)\s*(\d+\.?\d*)/);
  if (thresholdMatch) {
    const score = parseFloat(thresholdMatch[1]);
    const threshold = parseFloat(thresholdMatch[2]);
    const passed = gradingResult.pass;
    const color = passed ? chalk.green : chalk.red;
    return color(
      `Score: ${(score * 100).toFixed(0)}% ${passed ? '≥' : '<'} ${(threshold * 100).toFixed(0)}% threshold`,
    );
  }

  return '';
}

export interface GenerateTableOptions {
  tableCellMaxLength?: number;
  maxRows?: number;
  showAssertions?: boolean;
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

  const outputLines: string[] = [];

  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of evaluateTable.body.slice(0, maxRows)) {
    const rowCells: string[] = [];

    for (const v of row.vars) {
      rowCells.push(ellipsize(v, tableCellMaxLength));
    }

    for (const output of row.outputs) {
      const text = ellipsize(output.text, tableCellMaxLength);
      const isFail = !output.pass;

      // Build the cell content
      let cellContent: string;
      if (output.pass) {
        cellContent = chalk.green('[PASS] ') + text;
      } else {
        // Color everything red up until '---'
        cellContent =
          chalk.red(output.failureReason === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
          text
            .split('---')
            .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
            .join('---');
      }

      // Add score/threshold info for failures
      if (isFail) {
        const scoreThreshold = formatScoreThreshold(output);
        if (scoreThreshold) {
          cellContent += '\n       ' + scoreThreshold;
        }

        // Add assertion summary for failures
        const summary = generateAssertionSummary(output);
        if (summary) {
          cellContent += '\n       ' + summary;
        }
      }

      rowCells.push(cellContent);

      // If showAssertions is true or this is a failure, track assertion table for later
      if ((showAssertions || isFail) && output.gradingResult?.componentResults?.length) {
        outputLines.push(generateAssertionTable(output));
      }
    }

    table.push(rowCells);
  }

  let result = table.toString();

  // Append assertion tables if requested
  if (showAssertions && outputLines.length > 0) {
    result += '\n\n' + chalk.bold('Assertion Details:') + '\n';
    result += outputLines.join('\n');
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
