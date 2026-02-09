import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { isCI } from '../envars';
import { ResultFailureReason } from '../types/index';

import type { SingleBar } from 'cli-progress';
import type { EvalSummaryContext, Reporter, RunStartContext, TestResultContext } from './types';

/**
 * Options for the ProgressBarReporter
 */
export interface ProgressBarReporterOptions {
  /** Show progress bar (default: true in TTY, false in CI) */
  showProgressBar?: boolean;
}

/**
 * ProgressBarReporter - Legacy-style progress bar reporter
 *
 * Displays a progress bar with current test information, similar to the
 * original promptfoo progress display. This is useful when you want
 * minimal per-test output but still want to see overall progress.
 *
 * @example
 * ```yaml
 * evaluateOptions:
 *   reporters:
 *     - progressbar
 * ```
 */
export class ProgressBarReporter implements Reporter {
  private options: Required<ProgressBarReporterOptions>;
  private progressBar: SingleBar | null = null;
  private totalTests = 0;
  private passCount = 0;
  private failCount = 0;
  private errorCount = 0;

  constructor(options: ProgressBarReporterOptions = {}) {
    const isTTY = Boolean(process.stdout.isTTY) && !isCI();

    this.options = {
      showProgressBar: options.showProgressBar ?? isTTY,
    };
  }

  onRunStart(context: RunStartContext): void {
    this.totalTests = context.totalTests;
    this.passCount = 0;
    this.failCount = 0;
    this.errorCount = 0;

    if (!this.options.showProgressBar) {
      return;
    }

    // Create progress bar with pass/fail/error counts like DefaultReporter
    this.progressBar = new cliProgress.SingleBar(
      {
        format: `{bar} {percentage}% | {value}/{total} | ${chalk.green('{pass} pass')} | ${chalk.red('{fail} fail')} | ${chalk.yellow('{error} error')}`,
        hideCursor: true,
        gracefulExit: true,
        barsize: 30,
      },
      cliProgress.Presets.shades_classic,
    );

    this.progressBar.start(this.totalTests, 0, {
      pass: 0,
      fail: 0,
      error: 0,
    });

    // Print newline so log output appears below the progress bar
    process.stdout.write('\n');
  }

  onTestResult(context: TestResultContext): void {
    const { result } = context;

    // Track pass/fail/error counts
    const isError = result.failureReason === ResultFailureReason.ERROR;
    if (result.success) {
      this.passCount++;
    } else if (isError) {
      this.errorCount++;
    } else {
      this.failCount++;
    }

    if (!this.progressBar) {
      return;
    }

    this.progressBar.increment({
      pass: this.passCount,
      fail: this.failCount,
      error: this.errorCount,
    });
  }

  onRunComplete(context: EvalSummaryContext): void {
    if (this.progressBar) {
      // Stop the progress bar - this preserves the final state
      this.progressBar.stop();
      this.progressBar = null;
    }

    // Print summary on a new line (doesn't overwrite progress bar)
    const total = context.successes + context.failures + context.errors;
    process.stdout.write('\n');
    process.stdout.write(
      `${chalk.green(`${context.successes} passed`)}, ` +
        `${chalk.red(`${context.failures} failed`)}, ` +
        `${chalk.yellow(`${context.errors} errors`)} ` +
        `(${total} total)\n`,
    );
    // Extra newline for spacing before subsequent output
    process.stdout.write('\n');
  }
}
