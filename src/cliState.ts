import { AsyncLocalStorage } from 'node:async_hooks';

import { setEnvOverridesProvider } from './envOverrides';

import type { EnvOverrides, TestSuite, UnifiedConfig } from './types/index';

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

  /**
   * Snapshot of ALL result IDs that existed before a retry ran. Used to count only
   * rows newly persisted by this retry as replacements, so a pre-existing duplicate
   * success at the same (evalId, testIdx, promptIdx) is not miscounted.
   */
  _retryPreexistingResultIds?: string[];

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

  withMaxConcurrency<T>(maxConcurrency: number | undefined, fn: () => Promise<T>): Promise<T>;
  /** The innermost environment scope, or the last config's env outside a scope. */
  readonly env?: EnvOverrides;
  readonly envFileOverrides?: EnvOverrides;
  /** File values act as process defaults beneath each nested suite environment. */
  withEnvFileOverrides<T>(env: EnvOverrides | undefined, fn: () => T): T;
  /** Replaces the outer env for this call and its async work; undefined masks config env. */
  withEnv<T>(env: EnvOverrides | undefined, fn: () => T): T;
  withRequestTracingConfig<T>(
    tracingConfig: NonNullable<TestSuite['tracing']>,
    fn: () => Promise<T>,
  ): Promise<T>;
  setActiveOtlpReceiver(receiver?: ActiveOtlpReceiver): void;
}

const maxConcurrencyContextKey = Symbol.for('promptfoo.maxConcurrencyContext.v1');
const maxConcurrencyContexts = globalThis as Record<
  symbol,
  AsyncLocalStorage<{ maxConcurrency: number | undefined }> | undefined
>;
const maxConcurrencyContext = (maxConcurrencyContexts[maxConcurrencyContextKey] ??=
  new AsyncLocalStorage<{ maxConcurrency: number | undefined }>());
interface EnvironmentContext {
  invocation: Pick<CliState, 'basePath' | 'config' | 'selectedProviderConfigs'>;
  env: EnvOverrides | undefined;
  envFileOverrides?: EnvOverrides;
}
// JS configs can import the SDK alongside the CLI's separately bundled module copy.
// Both copies access the same invocation through this async context.
const environmentContextKey = Symbol.for('promptfoo.environmentContext.v1');
const environmentContexts = globalThis as Record<
  symbol,
  AsyncLocalStorage<EnvironmentContext> | undefined
>;
const envContext = (environmentContexts[environmentContextKey] ??=
  new AsyncLocalStorage<EnvironmentContext>());
const requestTracingConfigContext = new AsyncLocalStorage<{
  tracingConfig: NonNullable<TestSuite['tracing']>;
}>();
let globalMaxConcurrency: number | undefined;
const globalInvocation: EnvironmentContext['invocation'] = {};
let activeOtlpReceiver: ActiveOtlpReceiver | undefined;

const state: CliState = {
  get basePath() {
    return (envContext.getStore()?.invocation ?? globalInvocation).basePath;
  },
  set basePath(value: string | undefined) {
    (envContext.getStore()?.invocation ?? globalInvocation).basePath = value;
  },
  get config() {
    return (envContext.getStore()?.invocation ?? globalInvocation).config;
  },
  set config(value: CliState['config']) {
    (envContext.getStore()?.invocation ?? globalInvocation).config = value;
  },
  get selectedProviderConfigs() {
    return (envContext.getStore()?.invocation ?? globalInvocation).selectedProviderConfigs;
  },
  set selectedProviderConfigs(value: CliState['selectedProviderConfigs']) {
    (envContext.getStore()?.invocation ?? globalInvocation).selectedProviderConfigs = value;
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
  withMaxConcurrency<T>(maxConcurrency: number | undefined, fn: () => Promise<T>): Promise<T> {
    return maxConcurrencyContext.run({ maxConcurrency }, fn);
  },
  get env() {
    const store = envContext.getStore();
    return store ? store.env : state.config?.env;
  },
  get envFileOverrides() {
    return envContext.getStore()?.envFileOverrides;
  },
  withEnvFileOverrides<T>(env: EnvOverrides | undefined, fn: () => T): T {
    return envContext.run(
      {
        invocation: { ...(envContext.getStore()?.invocation ?? globalInvocation) },
        env: undefined,
        envFileOverrides: env,
      },
      fn,
    );
  },
  withEnv<T>(env: EnvOverrides | undefined, fn: () => T): T {
    // Config loading may resolve the path inside a nested environment scope.
    const invocation = envContext.getStore()?.invocation ?? globalInvocation;
    return envContext.run({ invocation, env, envFileOverrides: state.envFileOverrides }, fn);
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

setEnvOverridesProvider((layer) => (layer === 'file' ? state.envFileOverrides : state.env));

export default state;
