import chalk from 'chalk';

import type { EvalSummaryContext, Reporter, RunStartContext } from './types';

/**
 * SummaryReporter - Only outputs a final summary, no per-test output.
 *
 * Similar to Jest's summary reporter, this is useful when you want
 * minimal output during the test run but still want to see the final results.
 *
 * @example
 * ```yaml
 * evaluateOptions:
 *   reporters:
 *     - summary
 * ```
 */
export class SummaryReporter implements Reporter {
  private startTime: number = 0;

  onRunStart(_context: RunStartContext): void {
    this.startTime = Date.now();
  }

  onRunComplete(context: EvalSummaryContext): void {
    const duration = this.formatDuration(context.durationMs);
    const total = context.successes + context.failures + context.errors;

    console.log('');
    console.log(chalk.bold('Test Summary'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`  ${chalk.green.bold('Passed:')}  ${context.successes}`);
    console.log(`  ${chalk.red.bold('Failed:')}  ${context.failures}`);
    if (context.errors > 0) {
      console.log(`  ${chalk.yellow.bold('Errors:')}  ${context.errors}`);
    }
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`  ${chalk.bold('Total:')}   ${total}`);
    console.log(`  ${chalk.bold('Pass Rate:')} ${chalk.cyan(context.passRate.toFixed(1) + '%')}`);
    console.log(`  ${chalk.bold('Duration:')} ${duration}`);
    console.log('');
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
}
