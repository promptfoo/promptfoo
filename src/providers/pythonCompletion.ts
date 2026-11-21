import fs from 'fs/promises';
import path from 'path';

import { getCache, isCacheEnabled } from '../cache';
import cliState from '../cliState';
import { getEnvInt } from '../envars';
import logger from '../logger';
import { getConfiguredPythonPath } from '../python/pythonUtils';
import { PythonWorkerPool } from '../python/workerPool';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { parsePathOrGlob } from '../util/index';
import { safeJsonStringify } from '../util/json';
import { providerRegistry } from './providerRegistry';
import { sanitizeScriptContext } from './scriptContext';
import {
  applyCachedCallApiMetadata,
  buildScriptArgs,
  hasScriptResultError,
  validateScriptResult,
} from './scriptResult';
import { waitForPromiseWithAbort } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { ScriptApiType } from './scriptResult';

interface PythonProviderConfig {
  pythonExecutable?: string;
  workers?: number;
  timeout?: number;
  [key: string]: any; // Allow arbitrary config properties for user scripts
}

function applyFreshCallApiMetadata(apiType: ScriptApiType, result: any) {
  if (apiType !== 'call_api' || typeof result !== 'object' || result === null) {
    return result;
  }

  logger.debug(`PythonProvider explicitly setting cached=false for fresh result`);
  result.cached = false;

  // Ensure tokenUsage includes numRequests for fresh results
  if (result.tokenUsage && !result.tokenUsage.numRequests) {
    result.tokenUsage.numRequests = 1;
    logger.debug(
      `Added numRequests to fresh result token usage: ${JSON.stringify(result.tokenUsage)}`,
    );
  }

  return result;
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private startup?: AbortController;
  private shutdownPromise?: Promise<void>;
  private resolvedConfig?: PythonProviderConfig;
  public label: string | undefined;
  private pool: PythonWorkerPool | null = null;

  constructor(
    runPath: string,
    private options?: ProviderOptions,
  ) {
    const { filePath: providerPath, functionName } = parsePathOrGlob(
      options?.config.basePath || '',
      runPath,
    );
    this.scriptPath = path.relative(options?.config.basePath || '', providerPath);
    this.functionName = functionName || null;
    this.id = () => options?.id ?? `python:${this.scriptPath}:${this.functionName || 'default'}`;
    this.label = options?.label;
    this.config = options?.config ?? {};
  }

  id() {
    return `python:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  async initialize(): Promise<void> {
    // Failed teardown keeps ownership. Never replace a pool until it is stopped.
    while (this.shutdownPromise || this.startup?.signal.aborted) {
      await this.shutdown();
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const startup = new AbortController();
    this.startup = startup;
    const initialization = this.startPool(startup.signal);
    this.initializationPromise = initialization;
    providerRegistry.register(this);
    try {
      await initialization;
    } catch (error) {
      if (this.startup === startup && !startup.signal.aborted) {
        await this.shutdown().catch((cause) =>
          logger.warn('Failed to release Python provider after startup failure', { cause }),
        );
      }
      throw error;
    }
  }

  private async startPool(signal: AbortSignal) {
    const basePath = this.options?.config.basePath || '';
    if (this.config !== this.resolvedConfig) {
      const config = await processConfigFileReferences(this.config, basePath, signal);
      signal.throwIfAborted();
      // Resolved files can themselves contain literal file:// strings.
      this.config = config;
      this.resolvedConfig = config;
    }
    this.pool = new PythonWorkerPool(
      path.resolve(basePath, this.scriptPath),
      this.functionName || 'call_api',
      this.getWorkerCount(),
      getConfiguredPythonPath(this.config.pythonExecutable, this.options?.env?.PROMPTFOO_PYTHON),
      this.config.timeout,
    );
    await this.pool.initialize();
    signal.throwIfAborted();
    this.isInitialized = true;
  }

  /**
   * Determine worker count based on config and environment
   * Priority: config.workers > PROMPTFOO_PYTHON_WORKERS env > cliState.maxConcurrency (-j flag) > default 1
   *
   * Explicit Python-specific settings (config.workers, env var) take precedence over
   * general concurrency hints (-j flag) because users may limit Python workers due to
   * memory constraints or non-thread-safe scripts.
   */
  private getWorkerCount(): number {
    // 1. Explicit config.workers (highest priority - user knows their script's requirements)
    if (this.config.workers !== undefined) {
      if (this.config.workers < 1) {
        logger.warn(`Invalid worker count ${this.config.workers} in config, using minimum of 1`);
        return 1;
      }
      logger.debug(`Python provider using ${this.config.workers} workers (from config.workers)`);
      return this.config.workers;
    }

    // 2. Environment variable (explicit Python-specific setting)
    const providerWorkers = this.options?.env?.PROMPTFOO_PYTHON_WORKERS;
    const envWorkers =
      providerWorkers === undefined
        ? getEnvInt('PROMPTFOO_PYTHON_WORKERS')
        : Number.parseInt(providerWorkers, 10);
    if (envWorkers !== undefined && !Number.isNaN(envWorkers)) {
      if (envWorkers < 1) {
        logger.warn(
          `Invalid worker count ${envWorkers} in PROMPTFOO_PYTHON_WORKERS, using minimum of 1`,
        );
        return 1;
      }
      logger.debug(`Python provider using ${envWorkers} workers (from PROMPTFOO_PYTHON_WORKERS)`);
      return envWorkers;
    }

    // 3. CLI -j flag via cliState (general concurrency hint, only when explicitly set)
    if (cliState.maxConcurrency !== undefined) {
      if (cliState.maxConcurrency < 1) {
        logger.warn(
          `Invalid worker count ${cliState.maxConcurrency} from -j flag, using minimum of 1`,
        );
        return 1;
      }
      logger.debug(`Python provider using ${cliState.maxConcurrency} workers (from -j flag)`);
      return cliState.maxConcurrency;
    }

    // 4. Default: 1 worker (memory-efficient, backward compatible)
    logger.debug('Python provider using 1 worker (default)');
    return 1;
  }

  /**
   * Execute the Python script with the specified API type
   * Handles caching, file reference processing, and executing the Python script
   *
   * @param prompt - The prompt to pass to the Python script
   * @param context - Optional context information
   * @param apiType - The type of API to call (call_api, call_embedding_api, call_classification_api)
   * @returns The response from the Python script
   */
  private async executePythonScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: ScriptApiType,
    signal?: AbortSignal,
  ): Promise<any> {
    signal?.throwIfAborted();
    if (!this.isInitialized) {
      // A caller can stop waiting without cancelling a shared provider's startup.
      await waitForPromiseWithAbort(this.initialize(), signal);
    }
    signal?.throwIfAborted();
    const pool = this.pool;

    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(await fs.readFile(absPath, 'utf-8'));

    // Create cache key including the function name to ensure different functions don't share caches
    const cacheKey = `python:${this.scriptPath}:${this.functionName || 'default'}:${apiType}:${fileHash}:${prompt}:${JSON.stringify(
      this.options,
    )}:${JSON.stringify(context?.vars)}`;
    logger.debug(`PythonProvider cache key: ${cacheKey}`);

    const cache = await getCache();
    let cachedResult;
    const cacheEnabled = isCacheEnabled();
    logger.debug(`PythonProvider cache enabled: ${cacheEnabled}`);

    if (cacheEnabled) {
      cachedResult = await cache.get(cacheKey);
      logger.debug(`PythonProvider cache hit: ${Boolean(cachedResult)}`);
    }

    if (cachedResult) {
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      const parsedResult = JSON.parse(cachedResult as string);

      logger.debug(
        `PythonProvider parsed cached result type: ${typeof parsedResult}, keys: ${Object.keys(parsedResult).join(',')}`,
      );

      return applyCachedCallApiMetadata(apiType, parsedResult, 'Python');
    } else {
      const sanitizedContext = sanitizeScriptContext('PythonProvider', context);

      // Create a new options object with processed file references included in the config
      // This ensures any file:// references are replaced with their actual content
      const optionsWithProcessedConfig = {
        ...this.options,
        config: {
          ...this.options?.config,
          ...this.config, // Merge in the processed config containing resolved file references
        },
      };

      const args = buildScriptArgs(apiType, prompt, optionsWithProcessedConfig, sanitizedContext);

      logger.debug(
        `Executing python script ${absPath} via worker pool with args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      // Use worker pool instead of runPython
      signal?.throwIfAborted();
      if (!pool || this.pool !== pool || !this.isInitialized) {
        throw new Error('Python provider interrupted by cleanup');
      }
      const result = await pool.execute(functionName, args);

      validateScriptResult(apiType, functionName, result, 'Python');

      // Store result in cache if enabled and no errors
      const hasError = hasScriptResultError(result);

      if (isCacheEnabled() && !hasError) {
        logger.debug(`PythonProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      } else {
        logger.debug(
          `PythonProvider not caching result: ${isCacheEnabled() ? (hasError ? 'has error' : 'unknown reason') : 'cache disabled'}`,
        );
      }

      // Set cached=false on fresh results and ensure numRequests is set
      return applyFreshCallApiMetadata(apiType, result);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return this.executePythonScript(prompt, context, 'call_api', options?.abortSignal);
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }

  async cleanup(): Promise<void> {
    await this.shutdown();
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    this.isInitialized = false;
    this.startup?.abort(
      new DOMException('Python provider initialization interrupted by cleanup', 'AbortError'),
    );
    this.shutdownPromise = (async () => {
      const [cleanup] = await Promise.allSettled([
        this.pool?.shutdown(),
        this.initializationPromise,
      ]);
      if (cleanup.status === 'rejected') {
        throw cleanup.reason;
      }
      this.pool = null;
      this.initializationPromise = null;
      this.startup = undefined;
      providerRegistry.unregister(this);
    })().finally(() => {
      this.shutdownPromise = undefined;
    });
    return this.shutdownPromise;
  }
}
