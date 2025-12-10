import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { isCI } from '../envars';
import { ResultFailureReason } from '../types/index';
import { OutputController } from './OutputController';

import type { SingleBar } from 'cli-progress';
import type {
  EvalSummaryContext,
  Reporter,
  RunStartContext,
  TestResultContext,
} from './types';

/**
 * Options for the DefaultReporter
 */
export interface DefaultReporterOptions {
  /** Show errors inline (default: true) */
  showErrors?: boolean;
  /** Group by plugin/strategy for redteam (default: true) */
  showGrouping?: boolean;
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
 * - Grouping by plugin/strategy for redteam scans
 * - Progress bar with running pass/fail/error counts
 *
 * @see https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/DefaultReporter.ts
 */
export class DefaultReporter implements Reporter {
  private options: Required<DefaultReporterOptions>;
  private outputController: OutputController;
  private progressBar: SingleBar | null = null;
  private isRedteam: boolean = false;

  // Tracking for grouping
  private currentGroup: string | null = null;
  private groupResults: Map<string, { pass: number; fail: number; error: number }> = new Map();

  // Stats
  private passCount = 0;
  private failCount = 0;
  private errorCount = 0;
  private totalTests = 0;

  constructor(options: DefaultReporterOptions = {}) {
    const isTTY = Boolean(process.stdout.isTTY) && !isCI();

    this.options = {
      showErrors: options.showErrors ?? true,
      showGrouping: options.showGrouping ?? true,
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
    this.groupResults.clear();
    this.currentGroup = null;

    // Start output capture if enabled
    if (this.options.captureOutput) {
      this.outputController.startCapture();
      this.outputController.setStatusCallbacks(
        () => this.clearStatus(),
        () => this.reprintStatus(),
      );
    }

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

    // Determine grouping key for redteam
    let groupKey: string | null = null;
    if (this.isRedteam && this.options.showGrouping) {
      const pluginId = evalStep.test.metadata?.pluginId as string | undefined;
      const strategyId = evalStep.test.metadata?.strategyId as string | undefined;

      if (pluginId || strategyId) {
        const pluginName = pluginId ? this.getDisplayName(pluginId) : '';
        const strategyName = strategyId ? this.getDisplayName(strategyId) : '';

        if (pluginName && strategyName && strategyName !== 'Baseline Testing') {
          groupKey = `${pluginName} (${strategyName})`;
        } else {
          groupKey = pluginName || strategyName || null;
        }
      }
    }

    // Print group header if changed
    if (groupKey && groupKey !== this.currentGroup) {
      // Print summary for previous group
      if (this.currentGroup) {
        this.printGroupSummary(this.currentGroup);
      }
      this.currentGroup = groupKey;
      this.write(`\n${chalk.bold(groupKey)}\n`);
      this.groupResults.set(groupKey, { pass: 0, fail: 0, error: 0 });
    }

    // Update stats
    const isError = result.failureReason === ResultFailureReason.ERROR;
    if (result.success) {
      this.passCount++;
      if (groupKey) {
        const group = this.groupResults.get(groupKey)!;
        group.pass++;
      }
    } else if (isError) {
      this.errorCount++;
      if (groupKey) {
        const group = this.groupResults.get(groupKey)!;
        group.error++;
      }
    } else {
      this.failCount++;
      if (groupKey) {
        const group = this.groupResults.get(groupKey)!;
        group.fail++;
      }
    }

    // Print test result line
    const icon = result.success
      ? chalk.green('✓')
      : isError
        ? chalk.yellow('✗')
        : chalk.red('✗');

    const description =
      result.testCase.description || this.formatVars(evalStep.test.vars) || `Test ${context.index + 1}`;

    const provider = evalStep.provider.label || evalStep.provider.id();
    const latency = result.latencyMs ? chalk.gray(`(${result.latencyMs}ms)`) : '';

    // Indent based on whether we're showing groups
    const indent = this.options.showGrouping && this.isRedteam && groupKey ? '  ' : '';
    this.write(`${indent}${icon} ${description} ${chalk.dim(`[${provider}]`)} ${latency}\n`);

    // Show error inline if configured
    if (!result.success && this.options.showErrors && result.error) {
      const errorIndent = indent + '    ';
      const errorLines = result.error.split('\n').slice(0, 3); // Limit error lines
      for (const line of errorLines) {
        this.write(chalk.red(`${errorIndent}${line}\n`));
      }
    }

    // Reprint progress bar
    this.reprintStatus();
  }

  onRunComplete(_context: EvalSummaryContext): void {
    // Clear progress bar before final output
    this.clearStatus();

    // Print final group summary if any
    if (this.currentGroup) {
      this.printGroupSummary(this.currentGroup);
    }

    // Stop progress bar
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }

    // Stop output capture
    if (this.options.captureOutput) {
      this.outputController.stopCapture();
    }

    // Print a blank line for spacing
    this.write('\n');
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
   * Print summary for a group
   */
  private printGroupSummary(groupKey: string): void {
    const group = this.groupResults.get(groupKey);
    if (group) {
      const total = group.pass + group.fail + group.error;
      const passRate = total > 0 ? ((group.pass / total) * 100).toFixed(0) : '0';
      const indent = this.options.showGrouping && this.isRedteam ? '  ' : '';
      this.write(chalk.dim(`${indent}(${group.pass}/${total} passed, ${passRate}%)\n`));
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
