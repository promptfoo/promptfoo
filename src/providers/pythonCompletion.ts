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

import type {
  ApiProvider,
  CallApiContextParams,
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
  private initializationGeneration = 0;
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

  /**
   * Process any file:// references in the configuration and initialize worker pool
   * This should be called after initialization
   * @returns A promise that resolves when all file references have been processed
   */
  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise != null) {
      return this.initializationPromise;
    }

    const generation = ++this.initializationGeneration;
    this.initializationPromise = (async () => {
      let pool: PythonWorkerPool | undefined;
      try {
        const config = await processConfigFileReferences(
          this.config,
          this.options?.config.basePath || '',
        );
        if (generation !== this.initializationGeneration) {
          throw new Error('Python provider initialization interrupted by cleanup');
        }
        this.config = config;

        // Initialize worker pool
        const workerCount = this.getWorkerCount();
        const absPath = path.resolve(
          path.join(this.options?.config.basePath || '', this.scriptPath),
        );

        pool = new PythonWorkerPool(
          absPath,
          this.functionName || 'call_api',
          workerCount,
          getConfiguredPythonPath(
            this.config.pythonExecutable,
            this.options?.env?.PROMPTFOO_PYTHON,
          ),
          this.config.timeout,
        );
        this.pool = pool;
        providerRegistry.register(this);

        await pool.initialize();
        if (generation !== this.initializationGeneration) {
          throw new Error('Python provider initialization interrupted by cleanup');
        }

        this.isInitialized = true;
        logger.debug(`Initialized Python provider ${this.id()} with ${workerCount} workers`);
      } catch (error) {
        if (generation === this.initializationGeneration) {
          this.initializationPromise = null;
          if (pool && this.pool === pool) {
            this.pool = null;
            providerRegistry.unregister(this);
            try {
              await pool.shutdown();
            } catch (shutdownError) {
              logger.warn('Failed to shut down a Python provider after initialization failed', {
                error: shutdownError,
              });
            }
          }
        }
        throw error;
      }
    })();

    return this.initializationPromise;
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
  ): Promise<any> {
    if (!this.isInitialized || !this.pool) {
      await this.initialize();
    }

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
      const result = await this.pool!.execute(functionName, args);

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

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.executePythonScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }

  async cleanup(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    this.initializationGeneration++;
    const initialization = this.initializationPromise;
    this.initializationPromise = null;
    this.isInitialized = false;
    const pool = this.pool;
    this.pool = null;
    providerRegistry.unregister(this);
    await Promise.all([pool?.shutdown(), initialization?.catch(() => {})]);
  }
}
