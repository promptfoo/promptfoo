import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { isCI } from '../envars';
import { ResultFailureReason } from '../types/index';
import { OutputController } from './OutputController';
import type { SingleBar } from 'cli-progress';

import type { EvalSummaryContext, Reporter, RunStartContext, TestResultContext } from './types';

/**
 * Options for the DefaultReporter
 */
export interface DefaultReporterOptions {
  /** Show errors inline (default: true) */
  showErrors?: boolean;
  /** Show progress bar (default: true in TTY, false in CI) */
  showProgressBar?: boolean;
  /** Capture and buffer console output to prevent display corruption (default: true in TTY) */
  captureOutput?: boolean;
}

/**
 * DefaultReporter - Jest-like verbose reporter with progress bar
 *
 * Displays real-time test results with:
 * - Pass/fail indicators (✓/✗)
 * - Test description or vars
 * - Provider name and latency
 * - Inline error display
 * - Progress bar with running pass/fail/error counts
 *
 * @see https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/DefaultReporter.ts
 */
export class DefaultReporter implements Reporter {
  private options: Required<DefaultReporterOptions>;
  private outputController: OutputController;
  private progressBar: SingleBar | null = null;
  private isRedteam: boolean = false;

  // Stats
  private passCount = 0;
  private failCount = 0;
  private errorCount = 0;
  private totalTests = 0;

  constructor(options: DefaultReporterOptions = {}) {
    const isTTY = Boolean(process.stdout.isTTY) && !isCI();

    this.options = {
      showErrors: options.showErrors ?? true,
      showProgressBar: options.showProgressBar ?? isTTY,
      captureOutput: options.captureOutput ?? isTTY,
    };

    this.outputController = new OutputController();
  }

  onRunStart(context: RunStartContext): void {
    this.isRedteam = context.isRedteam;
    this.passCount = 0;
    this.failCount = 0;
    this.errorCount = 0;
    this.totalTests = context.totalTests;

    // Start output capture if enabled
    if (this.options.captureOutput) {
      this.outputController.startCapture();
      // Suppress auto-flush - we'll display buffered output with each test result
      this.outputController.setSuppressAutoFlush(true);
      this.outputController.setStatusCallbacks(
        () => this.clearStatus(),
        () => this.reprintStatus(),
      );
    }

    // Print initial "Running tests..." message
    const testType = this.isRedteam ? 'red team' : '';
    process.stdout.write(chalk.dim(`\nRunning ${context.totalTests} ${testType} tests...\n\n`));

    // Initialize progress bar
    if (this.options.showProgressBar) {
      this.progressBar = new cliProgress.SingleBar(
        {
          format: `{bar} {percentage}% | {value}/{total} | ${chalk.green('{pass} pass')} | ${chalk.red('{fail} fail')} | ${chalk.yellow('{error} error')}`,
          hideCursor: true,
          clearOnComplete: false,
          barsize: 30,
        },
        cliProgress.Presets.shades_classic,
      );
      this.progressBar.start(context.totalTests, 0, {
        pass: 0,
        fail: 0,
        error: 0,
      });
    }
  }

  onTestResult(context: TestResultContext): void {
    const { result, evalStep } = context;

    // Clear progress bar line before printing test result
    this.clearStatus();

    // Update stats
    const isError = result.failureReason === ResultFailureReason.ERROR;
    if (result.success) {
      this.passCount++;
    } else if (isError) {
      this.errorCount++;
    } else {
      this.failCount++;
    }

    // Print test result line
    const icon = result.success ? chalk.green('✓') : isError ? chalk.yellow('✗') : chalk.red('✗');

    // For redteam tests, show plugin/strategy info; otherwise show description or vars
    let description: string;
    if (this.isRedteam) {
      // Check multiple locations for pluginId/strategyId
      const pluginId = (evalStep.test.metadata?.pluginId ||
        result.testCase?.metadata?.pluginId ||
        result.metadata?.pluginId) as string | undefined;
      const strategyId = (evalStep.test.metadata?.strategyId ||
        result.testCase?.metadata?.strategyId ||
        result.metadata?.strategyId) as string | undefined;
      const pluginName = pluginId ? this.getDisplayName(pluginId) : undefined;
      const strategyName = strategyId ? this.getDisplayName(strategyId) : 'Baseline';

      if (pluginName && strategyName) {
        description = `${pluginName} (${strategyName})`;
      } else if (pluginName) {
        description = pluginName;
      } else if (strategyName) {
        description = strategyName;
      } else {
        description = result.testCase.description || `Test ${context.index + 1}`;
      }
    } else {
      description =
        result.testCase.description ||
        this.formatVars(evalStep.test.vars) ||
        `Test ${context.index + 1}`;
    }

    const provider = evalStep.provider.label || evalStep.provider.id();
    const latency = result.latencyMs ? chalk.gray(`(${result.latencyMs}ms)`) : '';
    const testCount = chalk.dim(`[${context.completed}/${context.total}]`);

    this.write(`${icon} ${testCount} ${description} ${chalk.dim(`[${provider}]`)} ${latency}\n`);

    // Show failure/error reason inline if configured
    if (!result.success && this.options.showErrors && result.error) {
      const label = isError ? 'Error:' : 'Failure:';
      const errorLines = result.error.split('\n').slice(0, 3); // Limit error lines
      this.write(chalk.red(`    ${label} ${errorLines[0]}\n`));
      for (const line of errorLines.slice(1)) {
        this.write(chalk.red(`    ${line}\n`));
      }
    }

    // Show captured logs for all tests
    if (result.logs && result.logs.length > 0) {
      this.write(chalk.dim('    Logs:\n'));
      // Show last 10 entries to keep output manageable
      for (const log of result.logs.slice(-10)) {
        const levelColor = log.level === 'error' ? chalk.red : chalk.yellow;
        const firstLine = log.message.split('\n')[0].slice(0, 100);
        this.write(chalk.dim(`      ${levelColor(`[${log.level}]`)} ${firstLine}\n`));
      }
    }

    // Show any buffered logger output that occurred during this test
    if (this.options.captureOutput && this.outputController.hasBufferedOutput()) {
      const bufferedOutput = this.outputController.getBufferedOutput();
      if (bufferedOutput) {
        // Indent and dim the logger output to distinguish it from test results
        const indentedOutput = bufferedOutput
          .split('\n')
          .map((line) => chalk.dim(`    ${line}`))
          .join('\n');
        this.write(`${indentedOutput}\n`);
      }
    }

    // Reprint progress bar
    this.reprintStatus();
  }

  onRunComplete(_context: EvalSummaryContext): void {
    // Stop progress bar - this prints a final newline to preserve output
    if (this.progressBar) {
      // Clear the progress bar line
      this.clearStatus();
      // Print the final progress bar state on its own line (won't be overwritten)
      this.progressBar.stop();
      this.progressBar = null;
    }

    // Stop output capture - flushes any remaining buffered output
    if (this.options.captureOutput) {
      this.outputController.stopCapture();
    }

    // Print a blank line for spacing before subsequent output (sharing, etc.)
    process.stdout.write('\n');
  }

  /**
   * Clear the progress bar status line
   */
  private clearStatus(): void {
    if (this.progressBar && this.options.showProgressBar) {
      // Move cursor to beginning of line and clear it
      this.outputController.writeToStdout('\r\x1b[K');
    }
  }

  /**
   * Reprint the progress bar status
   */
  private reprintStatus(): void {
    if (this.progressBar && this.options.showProgressBar) {
      this.progressBar.update(this.passCount + this.failCount + this.errorCount, {
        pass: this.passCount,
        fail: this.failCount,
        error: this.errorCount,
      });
    }
  }

  /**
   * Get display name for a plugin or strategy ID
   */
  private getDisplayName(id: string): string {
    // Capitalize and format the ID for display
    // This could be enhanced to use displayNameOverrides from redteam/constants
    return id
      .split(/[-:]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format vars for display
   */
  private formatVars(vars: Record<string, unknown> | undefined, maxLen = 50): string {
    if (!vars || Object.keys(vars).length === 0) {
      return '';
    }
    const str = Object.entries(vars)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${String(v).slice(0, 20)}`)
      .join(', ');
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  }

  /**
   * Write output (through output controller if capturing, otherwise directly)
   */
  private write(data: string): void {
    if (this.options.captureOutput && this.outputController.isActive()) {
      this.outputController.writeToStdout(data);
    } else {
      process.stdout.write(data);
    }
  }
}
