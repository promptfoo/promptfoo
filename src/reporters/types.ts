import type { EvaluateResult, PromptMetrics, RunEvalOptions } from '../types/index';

/**
 * Context provided when a test result is available
 */
export interface TestResultContext {
  /** The completed evaluation result */
  result: EvaluateResult;
  /** The original eval options for this test */
  evalStep: RunEvalOptions;
  /** Current prompt metrics */
  metrics: PromptMetrics;
  /** Current completed count */
  completed: number;
  /** Total test count */
  total: number;
  /** Zero-based index of this test */
  index: number;
}

/**
 * Context provided when evaluation run starts
 */
export interface RunStartContext {
  /** Total number of tests to run */
  totalTests: number;
  /** Max concurrency */
  concurrency: number;
  /** Whether this is a redteam evaluation */
  isRedteam: boolean;
}

/**
 * Context provided during iteration progress updates (for multi-turn strategies)
 */
export interface IterationProgressContext {
  /** Zero-based index of the test */
  testIndex: number;
  /** Current iteration (1-based) */
  currentIteration: number;
  /** Total iterations planned */
  totalIterations: number;
  /** Optional description of what's happening */
  description?: string;
}

/**
 * Summary context provided at end of evaluation
 */
export interface EvalSummaryContext {
  /** Total successes */
  successes: number;
  /** Total failures */
  failures: number;
  /** Total errors */
  errors: number;
  /** Pass rate percentage */
  passRate: number;
  /** Total duration in ms */
  durationMs: number;
  /** Whether this is a redteam evaluation */
  isRedteam: boolean;
}

/**
 * Reporter interface - all methods are optional
 * Similar to Jest's Reporter interface
 *
 * @see https://jestjs.io/docs/configuration#reporters-arraymodulename--modulename-options
 * @see https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/types.ts
 */
export interface Reporter {
  /** Called when evaluation run starts */
  onRunStart?(context: RunStartContext): void | Promise<void>;

  /** Called when a test starts (before provider call) */
  onTestStart?(evalStep: RunEvalOptions, index: number): void | Promise<void>;

  /** Called during multi-turn strategy iterations (e.g., iterative jailbreak) */
  onIterationProgress?(context: IterationProgressContext): void | Promise<void>;

  /** Called when a test completes */
  onTestResult?(context: TestResultContext): void | Promise<void>;

  /** Called when all tests complete */
  onRunComplete?(context: EvalSummaryContext): void | Promise<void>;

  /** Optional method to retrieve any error that occurred during reporting */
  getLastError?(): Error | undefined;
}

/**
 * Reporter configuration in YAML/config
 * Similar to Jest's reporter config format
 *
 * @example
 * ```yaml
 * # String format
 * reporters:
 *   - default
 *   - json
 *
 * # Tuple format with options
 * reporters:
 *   - [default, { showErrors: false }]
 *   - [json, { outputFile: './results.json' }]
 *
 * # Custom reporter from file
 * reporters:
 *   - file://./my-reporter.ts
 * ```
 */
export type ReporterConfig = string | [string, Record<string, unknown>];
