import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { isCI } from '../envars';

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
 * Safely formats variables for display in progress bars.
 * Handles extremely large variables that could cause RangeError crashes.
 */
function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  try {
    const formatted = Object.entries(vars)
      .map(([key, value]) => {
        const valueStr = String(value).slice(0, 100);
        return `${key}=${valueStr}`;
      })
      .join(' ')
      .replace(/\n/g, ' ')
      .slice(0, maxLength);

    return formatted;
  } catch {
    return '[vars unavailable]';
  }
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
  private completedCount = 0;
  private errorCount = 0;

  constructor(options: ProgressBarReporterOptions = {}) {
    const isTTY = Boolean(process.stdout.isTTY) && !isCI();

    this.options = {
      showProgressBar: options.showProgressBar ?? isTTY,
    };
  }

  onRunStart(context: RunStartContext): void {
    this.totalTests = context.totalTests;
    this.completedCount = 0;
    this.errorCount = 0;

    if (!this.options.showProgressBar) {
      return;
    }

    // Create progress bar with legacy format
    this.progressBar = new cliProgress.SingleBar(
      {
        format: (options, params, payload) => {
          const barsize = options.barsize ?? 40;
          const barCompleteString = options.barCompleteString ?? '=';
          const barIncompleteString = options.barIncompleteString ?? '-';

          const bar = barCompleteString.substring(0, Math.round(params.progress * barsize));
          const spaces = barIncompleteString.substring(0, barsize - bar.length);
          const percentage = Math.round(params.progress * 100);

          // Only show errors if count > 0
          const errorsText = payload.errors > 0 ? ` (errors: ${payload.errors})` : '';

          return `Evaluating [${bar}${spaces}] ${percentage}% | ${params.value}/${params.total}${errorsText} | ${payload.provider} ${payload.prompt} ${payload.vars}`;
        },
        hideCursor: true,
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );

    this.progressBar.start(this.totalTests, 0, {
      provider: '',
      prompt: '',
      vars: '',
      errors: 0,
    });
  }

  onTestResult(context: TestResultContext): void {
    const { result, evalStep, metrics } = context;

    this.completedCount++;

    // Track errors
    if (result.error) {
      this.errorCount = metrics?.testErrorCount ?? this.errorCount + 1;
    }

    if (!this.progressBar) {
      return;
    }

    const provider = evalStep.provider.label || evalStep.provider.id();
    const prompt = `"${evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' ')}"`;
    const vars = formatVarsForDisplay(evalStep.test.vars, 10);

    this.progressBar.increment({
      provider,
      prompt: prompt || '""',
      vars: vars || '',
      errors: this.errorCount,
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
