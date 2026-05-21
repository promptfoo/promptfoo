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

export { DefaultReporter } from './DefaultReporter';
export { OutputController } from './OutputController';
export { ProgressBarReporter } from './ProgressBarReporter';
export { SilentReporter } from './SilentReporter';
export { SummaryReporter } from './SummaryReporter';
export * from './types';

type ReporterConstructor = new (options?: Record<string, unknown>) => Reporter;
type ReporterFactory = (options?: Record<string, unknown>) => Reporter | Promise<Reporter>;

const REPORTER_EXPORT_NAME_RE = /^[A-Za-z_$][\w$]*$/;
const REPORTER_METHODS = [
  'getLastError',
  'onIterationProgress',
  'onRunComplete',
  'onRunStart',
  'onTestResult',
  'onTestStart',
  'cleanup',
] as const satisfies readonly (keyof Reporter)[];

/**
 * Built-in reporter registry
 */
const builtInReporters = new Map<string, ReporterConstructor>([
  ['default', DefaultReporter],
  ['verbose', DefaultReporter], // alias
  ['silent', SilentReporter],
  ['summary', SummaryReporter],
  ['progressbar', ProgressBarReporter],
  ['progress', ProgressBarReporter], // alias
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function hasReporterMethod(value: unknown): boolean {
  return isRecord(value) && REPORTER_METHODS.some((method) => typeof value[method] === 'function');
}

function isClassFunction(value: unknown): boolean {
  return typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value));
}

function isReporterConstructor(value: unknown): value is ReporterConstructor {
  return typeof value === 'function' && hasReporterMethod(value.prototype);
}

function assertReporter(value: unknown, reporterName: string): Reporter {
  if (hasReporterMethod(value)) {
    return value as Reporter;
  }
  throw new Error(`Reporter ${reporterName} must expose at least one reporter lifecycle method`);
}

function getReporterExport(mod: unknown, funcName: string | undefined): unknown {
  if (!funcName) {
    return mod;
  }
  if (!REPORTER_EXPORT_NAME_RE.test(funcName)) {
    throw new Error(`Invalid reporter export name: ${funcName}`);
  }
  if (!isRecord(mod) || !Object.hasOwn(mod, funcName)) {
    throw new Error(`Reporter export not found: ${funcName}`);
  }
  return mod[funcName];
}

async function createReporter(
  moduleExport: unknown,
  options: Record<string, unknown>,
  reporterName: string,
): Promise<Reporter> {
  if (isReporterConstructor(moduleExport) || isClassFunction(moduleExport)) {
    const ReporterClass = moduleExport as ReporterConstructor;
    return assertReporter(new ReporterClass(options), reporterName);
  }

  if (typeof moduleExport === 'function') {
    const reporterFactory = moduleExport as ReporterFactory;
    return assertReporter(await reporterFactory(options), reporterName);
  }

  return assertReporter(moduleExport, reporterName);
}

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
  const BuiltInReporter = builtInReporters.get(name);
  if (BuiltInReporter) {
    return new BuiltInReporter(options);
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
    const mod = await importModule(resolvedPath);
    return createReporter(getReporterExport(mod, funcName), options, name);
  }

  throw new Error(
    `Unknown reporter: ${name}. Built-in reporters: ${Array.from(builtInReporters.keys()).join(', ')}`,
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
   * Called when evaluation is ending, including error paths.
   */
  async cleanup(): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.cleanup?.();
      } catch (err) {
        logger.warn(`Reporter cleanup error: ${err}`);
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
