import type { UnifiedConfig } from './types/index';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates an evaluation is running in resume mode
  resume?: boolean;

  /**
   * Indicates an evaluation is running in retry mode (retrying ERROR results).
   *
   * Retry mode is a specialized form of resume mode with these differences:
   * - `resume` mode skips all completed (testIdx, promptIdx) pairs
   * - `retryMode` additionally excludes ERROR results from "completed" pairs,
   *   so they get re-evaluated instead of skipped
   *
   * When `retryMode` is true, `resume` should also be true.
   * The evaluator's `getCompletedIndexPairs()` uses this flag to exclude ERROR
   * results from the completed set, allowing them to be retried.
   */
  retryMode?: boolean;

  // debug log file
  debugLogFile?: string;

  // error log file
  errorLogFile?: string;

  // Final callback to be called after all output is flushed
  postActionCallback?: () => Promise<void>;

  // Maximum concurrency from CLI -j flag (propagated to providers like Python)
  maxConcurrency?: number;
}

const state: CliState = {};

export default state;
