import chalk from 'chalk';
import { isCI } from '../envars';
import { ResultFailureReason } from '../types/index';
import { OutputController } from './OutputController';

import type { EvalSummaryContext, Reporter, RunStartContext, TestResultContext } from './types';

/**
 * Options for the DefaultReporter
 */
export interface DefaultReporterOptions {
  /** Show errors inline (default: true) */
  showErrors?: boolean;
  /** Show running status line (default: true in TTY, false in CI) */
  showStatus?: boolean;
  /** Capture and buffer console output to prevent display corruption (default: true in TTY) */
  captureOutput?: boolean;
}

/**
 * DefaultReporter - Jest-like verbose reporter
 *
 * Displays real-time test results with:
 * - Pass/fail indicators (✓/✗)
 * - Test description or vars
 * - Provider name and latency
 * - Inline error display
 * - Running status indicator
 *
 * @see https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/DefaultReporter.ts
 */
export class DefaultReporter implements Reporter {
  private options: Required<DefaultReporterOptions>;
  private outputController: OutputController;
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
      showStatus: options.showStatus ?? isTTY,
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

    // Print initial header
    const testType = this.isRedteam ? 'red team ' : '';
    process.stdout.write(chalk.dim(`\nRunning ${context.totalTests} ${testType}tests...\n\n`));

    // Print initial status line (will be cleared/replaced as tests complete)
    if (this.options.showStatus) {
      process.stdout.write(chalk.dim(`Running test 1 of ${this.totalTests}...\n`));
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
        // Indent all lines of the message
        const lines = log.message.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (log.level === 'error') {
            // Errors are bright red, not dimmed
            if (i === 0) {
              this.write(`      ${chalk.red.bold(`[${log.level}]`)} ${chalk.red(line)}\n`);
            } else {
              this.write(`      ${chalk.red('         ' + line)}\n`);
            }
          } else if (log.level === 'warn') {
            if (i === 0) {
              this.write(`      ${chalk.yellow(`[${log.level}]`)} ${chalk.dim(line)}\n`);
            } else {
              this.write(chalk.dim(`               ${line}\n`));
            }
          } else {
            if (i === 0) {
              this.write(chalk.dim(`      [${log.level}] ${line}\n`));
            } else {
              this.write(chalk.dim(`              ${line}\n`));
            }
          }
        }
      }
      // Add blank line after logs for visual separation from progress bar
      this.write('\n');
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

    // Reprint progress bar at bottom
    this.reprintStatus();
  }

  onRunComplete(context: EvalSummaryContext): void {
    // Clear status line
    this.clearStatus();

    // Stop output capture - flushes any remaining buffered output
    if (this.options.captureOutput) {
      this.outputController.stopCapture();
    }

    // Print summary
    process.stdout.write(
      `\n${chalk.green(`${context.successes} passed`)}, ` +
        `${chalk.red(`${context.failures} failed`)}, ` +
        `${chalk.yellow(`${context.errors} errors`)} ` +
        `(${context.successes + context.failures + context.errors} total)\n\n`,
    );
  }

  /**
   * Clear the status line
   */
  private clearStatus(): void {
    if (this.options.showStatus) {
      // Move cursor up one line, go to beginning, and clear the line
      this.outputController.writeToStdout('\x1b[1A\r\x1b[K');
    }
  }

  /**
   * Print the current status line
   */
  private reprintStatus(): void {
    if (this.options.showStatus) {
      const completed = this.passCount + this.failCount + this.errorCount;
      const status = chalk.dim(`Running test ${completed + 1} of ${this.totalTests}...`);
      this.outputController.writeToStdout(`${status}\n`);
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
