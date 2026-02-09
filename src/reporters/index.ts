import path from 'path';

import { importModule } from '../esm';
import logger from '../logger';
import { DefaultReporter } from './DefaultReporter';
import { ProgressBarReporter } from './ProgressBarReporter';
import { SilentReporter } from './SilentReporter';
import { SummaryReporter } from './SummaryReporter';

import type { RunEvalOptions } from '../types';
import type {
  EvalSummaryContext,
  IterationProgressContext,
  Reporter,
  ReporterConfig,
  RunStartContext,
  TestResultContext,
} from './types';

export * from './types';
export { DefaultReporter } from './DefaultReporter';
export { ProgressBarReporter } from './ProgressBarReporter';
export { SilentReporter } from './SilentReporter';
export { SummaryReporter } from './SummaryReporter';
export { OutputController } from './OutputController';

/**
 * Built-in reporter registry
 */
const builtInReporters: Record<string, new (options?: Record<string, unknown>) => Reporter> = {
  default: DefaultReporter,
  verbose: DefaultReporter, // alias
  silent: SilentReporter,
  summary: SummaryReporter,
  progressbar: ProgressBarReporter,
  progress: ProgressBarReporter, // alias
};

/**
 * Load a reporter from configuration
 *
 * @param config - Reporter configuration (string name, file path, or [name, options] tuple)
 * @returns Promise resolving to a Reporter instance
 *
 * @example
 * ```typescript
 * // Built-in reporter
 * const reporter = await loadReporter('default');
 *
 * // Built-in reporter with options
 * const reporter = await loadReporter(['default', { showErrors: false }]);
 *
 * // Custom reporter from file
 * const reporter = await loadReporter('file://./my-reporter.ts');
 * ```
 */
export async function loadReporter(config: ReporterConfig): Promise<Reporter> {
  const [name, options] = Array.isArray(config) ? config : [config, {}];

  // Check built-in reporters
  if (builtInReporters[name]) {
    return new builtInReporters[name](options);
  }

  // Load from file path
  if (name.startsWith('file://')) {
    const filePath = name.slice('file://'.length);
    const [modulePath, funcName] = filePath.includes(':')
      ? [
          filePath.substring(0, filePath.lastIndexOf(':')),
          filePath.substring(filePath.lastIndexOf(':') + 1),
        ]
      : [filePath, undefined];

    const resolvedPath = path.resolve(modulePath);
    const mod = await importModule(resolvedPath, funcName);

    // Module can export a class, function, or instance
    if (typeof mod === 'function') {
      // Check if it's a class (has prototype with reporter methods)
      if (
        mod.prototype &&
        (typeof mod.prototype.onRunStart === 'function' ||
          typeof mod.prototype.onTestResult === 'function' ||
          typeof mod.prototype.onRunComplete === 'function')
      ) {
        return new mod(options);
      }
      // Factory function
      return mod(options);
    }

    // Already an instance
    return mod as Reporter;
  }

  throw new Error(
    `Unknown reporter: ${name}. Built-in reporters: ${Object.keys(builtInReporters).join(', ')}`,
  );
}

/**
 * ReporterManager - Manages multiple reporters and calls their lifecycle methods
 *
 * @example
 * ```typescript
 * const manager = new ReporterManager();
 * await manager.addReporter('default');
 * await manager.addReporter(['summary', { showDuration: true }]);
 *
 * await manager.onRunStart({ totalTests: 100, concurrency: 4, isRedteam: false });
 * // ... during evaluation ...
 * await manager.onTestResult({ result, evalStep, metrics, completed, total, index });
 * // ... at the end ...
 * await manager.onRunComplete({ successes, failures, errors, passRate, durationMs, isRedteam });
 * ```
 */
export class ReporterManager {
  private reporters: Reporter[] = [];

  /**
   * Add a reporter to the manager
   */
  async addReporter(config: ReporterConfig): Promise<void> {
    try {
      const reporter = await loadReporter(config);
      this.reporters.push(reporter);
    } catch (error) {
      logger.error(`Failed to load reporter: ${error}`);
      throw error;
    }
  }

  /**
   * Called when evaluation run starts
   */
  async onRunStart(context: RunStartContext): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.onRunStart?.(context);
      } catch (err) {
        logger.warn(`Reporter onRunStart error: ${err}`);
      }
    }
  }

  /**
   * Called when a test starts
   */
  async onTestStart(evalStep: RunEvalOptions, index: number): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.onTestStart?.(evalStep, index);
      } catch (err) {
        logger.warn(`Reporter onTestStart error: ${err}`);
      }
    }
  }

  /**
   * Called during multi-turn strategy iterations
   */
  async onIterationProgress(context: IterationProgressContext): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.onIterationProgress?.(context);
      } catch (err) {
        logger.warn(`Reporter onIterationProgress error: ${err}`);
      }
    }
  }

  /**
   * Called when a test completes
   */
  async onTestResult(context: TestResultContext): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.onTestResult?.(context);
      } catch (err) {
        logger.warn(`Reporter onTestResult error: ${err}`);
      }
    }
  }

  /**
   * Called when all tests complete
   */
  async onRunComplete(context: EvalSummaryContext): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.onRunComplete?.(context);
      } catch (err) {
        logger.warn(`Reporter onRunComplete error: ${err}`);
      }
    }
  }

  /**
   * Get any errors from reporters
   */
  getLastError(): Error | undefined {
    for (const reporter of this.reporters) {
      const error = reporter.getLastError?.();
      if (error) {
        return error;
      }
    }
  }

  /**
   * Get the number of reporters
   */
  get count(): number {
    return this.reporters.length;
  }
}
