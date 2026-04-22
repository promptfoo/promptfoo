import { AsyncLocalStorage } from 'node:async_hooks';

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

  /**
   * Stores the IDs of ERROR results that are being retried.
   * These are deleted after successful retry to avoid duplicates.
   * Added in v0.121.0 as part of the retry data safety fix.
   */
  _retryErrorResultIds?: string[];

  // debug log file
  debugLogFile?: string;

  // error log file
  errorLogFile?: string;

  // Final callback to be called after all output is flushed
  postActionCallback?: () => Promise<void>;

  // Maximum concurrency from CLI -j flag (propagated to providers like Python)
  maxConcurrency?: number;

  // Current evaluation ID, used by remote task and grading calls for tracing.
  evaluationId?: string;

  withMaxConcurrency<T>(maxConcurrency: number, fn: () => Promise<T>): Promise<T>;
  withEvaluationId<T>(evaluationId: string | undefined, fn: () => Promise<T>): Promise<T>;
}

const maxConcurrencyContext = new AsyncLocalStorage<{ maxConcurrency: number | undefined }>();
let globalMaxConcurrency: number | undefined;
const evaluationIdContext = new AsyncLocalStorage<{ evaluationId: string | undefined }>();
let globalEvaluationId: string | undefined;

const state: CliState = {
  get evaluationId() {
    const store = evaluationIdContext.getStore();
    if (store) {
      return store.evaluationId;
    }
    return globalEvaluationId;
  },
  set evaluationId(value: string | undefined) {
    const store = evaluationIdContext.getStore();
    if (store) {
      store.evaluationId = value;
      return;
    }
    globalEvaluationId = value;
  },
  get maxConcurrency() {
    const store = maxConcurrencyContext.getStore();
    if (store) {
      return store.maxConcurrency;
    }
    return globalMaxConcurrency;
  },
  set maxConcurrency(value: number | undefined) {
    const store = maxConcurrencyContext.getStore();
    if (store) {
      store.maxConcurrency = value;
      return;
    }
    globalMaxConcurrency = value;
  },
  withMaxConcurrency<T>(maxConcurrency: number, fn: () => Promise<T>): Promise<T> {
    return maxConcurrencyContext.run({ maxConcurrency }, fn);
  },
  withEvaluationId<T>(evaluationId: string | undefined, fn: () => Promise<T>): Promise<T> {
    return evaluationIdContext.run({ evaluationId }, fn);
  },
};

export default state;
