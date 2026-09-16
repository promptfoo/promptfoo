import { AsyncLocalStorage } from 'node:async_hooks';

import { setEnvOverridesProvider } from './envOverrides';

import type { TestSuite, UnifiedConfig } from './types/index';

export interface ActiveOtlpReceiver {
  host: string;
  port: number;
  acceptFormats: readonly ('json' | 'protobuf')[];
}

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;
  selectedProviderConfigs?: Partial<UnifiedConfig>['providers'];

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
  readonly requestTracingConfig?: TestSuite['tracing'];
  readonly activeOtlpReceiver?: ActiveOtlpReceiver;

  withMaxConcurrency<T>(maxConcurrency: number, fn: () => Promise<T>): Promise<T>;
  withRequestTracingConfig<T>(
    tracingConfig: NonNullable<TestSuite['tracing']>,
    fn: () => Promise<T>,
  ): Promise<T>;
  setActiveOtlpReceiver(receiver?: ActiveOtlpReceiver): void;
}

const maxConcurrencyContext = new AsyncLocalStorage<{ maxConcurrency: number | undefined }>();
const requestTracingConfigContext = new AsyncLocalStorage<{
  tracingConfig: NonNullable<TestSuite['tracing']>;
}>();
let globalMaxConcurrency: number | undefined;
let activeOtlpReceiver: ActiveOtlpReceiver | undefined;

const state: CliState = {
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
  get requestTracingConfig() {
    return requestTracingConfigContext.getStore()?.tracingConfig;
  },
  get activeOtlpReceiver() {
    return activeOtlpReceiver;
  },
  withRequestTracingConfig<T>(
    tracingConfig: NonNullable<TestSuite['tracing']>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return requestTracingConfigContext.run({ tracingConfig }, fn);
  },
  setActiveOtlpReceiver(receiver?: ActiveOtlpReceiver): void {
    activeOtlpReceiver = receiver
      ? { ...receiver, acceptFormats: [...receiver.acceptFormats] }
      : undefined;
  },
};

setEnvOverridesProvider(() => state.config?.env);

export default state;
