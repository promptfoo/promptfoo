import chalk from 'chalk';
import { isCI } from '../envars';
import { ResultFailureReason } from '../types/index';
import { OutputController } from './OutputController';

import type { RunEvalOptions } from '../types';
import type {
  EvalSummaryContext,
  IterationProgressContext,
  Reporter,
  RunStartContext,
  TestResultContext,
} from './types';

/**
 * Info about a test currently in progress
 */
interface InProgressTest {
  index: number;
  description: string;
  provider: string;
  startTime: number;
}

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

  // Iteration progress tracking (for multi-turn strategies)
  // Map of testIndex -> iteration state, to handle concurrent tests
  private iterationProgress: Map<number, { current: number; total: number }> = new Map();

  // Track tests currently in progress with their details
  private testsInProgress: Map<number, InProgressTest> = new Map();

  // Track how many lines the status block takes (for clearing)
  private statusLineCount = 0;

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
    this.testsInProgress.clear();
    this.iterationProgress.clear();

    // Print initial header BEFORE starting output capture
    const testType = this.isRedteam ? 'red team ' : '';
    process.stdout.write(chalk.dim(`\nRunning ${context.totalTests} ${testType}tests...\n\n`));

    // Print initial status line (will be cleared/replaced as tests complete)
    if (this.options.showStatus) {
      this.reprintStatusDirect();
    }

    // Start output capture AFTER printing header
    if (this.options.captureOutput) {
      this.outputController.startCapture();
      // Suppress auto-flush - we'll display buffered output with each test result
      this.outputController.setSuppressAutoFlush(true);
      this.outputController.setStatusCallbacks(
        () => this.clearStatus(),
        () => this.reprintStatus(),
      );
    }
  }

  onTestStart(evalStep: RunEvalOptions, index: number): void {
    // Extract test info for status display
    const test = evalStep.test;
    const provider = evalStep.provider;

    let description: string;
    if (this.isRedteam) {
      const pluginId = test.metadata?.pluginId as string | undefined;
      const strategyId = test.metadata?.strategyId as string | undefined;
      const pluginName = pluginId ? this.getDisplayName(pluginId) : undefined;
      const strategyName = strategyId ? this.getDisplayName(strategyId) : undefined;

      if (pluginName && strategyName) {
        description = `${pluginName} (${strategyName})`;
      } else if (pluginName) {
        description = pluginName;
      } else if (strategyName) {
        description = strategyName;
      } else {
        description = test.description || `Test ${index + 1}`;
      }
    } else {
      description = test.description || this.formatVars(test.vars) || `Test ${index + 1}`;
    }

    this.testsInProgress.set(index, {
      index,
      description,
      provider: provider.label || provider.id(),
      startTime: Date.now(),
    });

    if (this.options.showStatus) {
      this.clearStatus();
      this.reprintStatus();
    }
  }

  onIterationProgress(context: IterationProgressContext): void {
    // Update iteration tracking for this specific test
    this.iterationProgress.set(context.testIndex, {
      current: context.currentIteration,
      total: context.totalIterations,
    });

    // Update the status line to show iteration progress
    if (this.options.showStatus) {
      this.clearStatus();
      this.reprintStatus();
    }
  }

  onTestResult(context: TestResultContext): void {
    const { result, evalStep } = context;

    // Clear progress bar line before printing test result
    this.clearStatus();

    // Remove tracking for this completed test
    this.iterationProgress.delete(context.index);
    this.testsInProgress.delete(context.index);

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
      const strategyName = strategyId ? this.getDisplayName(strategyId) : undefined;

      if (pluginName && strategyName) {
        description = `Plugin: ${pluginName} (Strategy: ${strategyName})`;
      } else if (pluginName) {
        description = `Plugin: ${pluginName}`;
      } else if (strategyName) {
        description = `Strategy: ${strategyName}`;
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
   * Clear all status lines
   */
  private clearStatus(): void {
    if (this.options.showStatus && this.statusLineCount > 0) {
      // Clear each line we've written: move up, go to beginning, clear line
      for (let i = 0; i < this.statusLineCount; i++) {
        this.outputController.writeToStdout('\x1b[1A\r\x1b[K');
      }
      this.statusLineCount = 0;
    }
  }

  /**
   * Build the multi-line status block
   * Returns an array of lines to print
   */
  private buildStatusLines(): string[] {
    const lines: string[] = [];
    const completed = this.passCount + this.failCount + this.errorCount;
    const inProgress = this.testsInProgress.size;

    // Header line: "Completed: X/Y. In Progress: Z"
    let header = chalk.blue(
      `Completed: ${completed}/${this.totalTests}. In Progress: ${inProgress}`,
    );

    // Add iteration summary if any tests have iterations
    if (this.iterationProgress.size > 0) {
      header += chalk.dim(' (multi-turn)');
    }

    lines.push(header);

    // Show details for each in-progress test (limit to 10 to avoid overwhelming output)
    const tests = Array.from(this.testsInProgress.values()).slice(0, 10);
    for (const test of tests) {
      const elapsed = Math.round((Date.now() - test.startTime) / 1000);
      const iteration = this.iterationProgress.get(test.index);

      let testLine = chalk.dim('  → ') + chalk.cyan(test.description);
      testLine += chalk.dim(` [${test.provider}]`);

      if (iteration) {
        testLine += chalk.yellow(` iter ${iteration.current}/${iteration.total}`);
      }

      testLine += chalk.dim(` ${elapsed}s`);

      lines.push(testLine);
    }

    // Show "+N more" if there are more tests than we're showing
    if (this.testsInProgress.size > 10) {
      lines.push(chalk.dim(`  ... +${this.testsInProgress.size - 10} more`));
    }

    return lines;
  }

  /**
   * Print the current status block (through output controller)
   */
  private reprintStatus(): void {
    if (this.options.showStatus) {
      const lines = this.buildStatusLines();
      this.statusLineCount = lines.length;
      this.outputController.writeToStdout(lines.join('\n') + '\n');
    }
  }

  /**
   * Print the current status block directly to stdout (before output capture starts)
   */
  private reprintStatusDirect(): void {
    const lines = this.buildStatusLines();
    this.statusLineCount = lines.length;
    process.stdout.write(lines.join('\n') + '\n');
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
