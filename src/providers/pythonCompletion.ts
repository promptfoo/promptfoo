import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { getEnvInt } from '../python/pythonUtils';
import { PythonWorkerPool } from '../python/workerPool';
import { parsePathOrGlob } from '../util/index';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { safeJsonStringify } from '../util/json';
import { providerRegistry } from './providerRegistry';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

interface PythonProviderConfig {
  pythonExecutable?: string;
  workers?: number;
  timeout?: number;
  [key: string]: any; // Allow arbitrary config properties for user scripts
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  public label: string | undefined;
  private pool: PythonWorkerPool | null = null;

  constructor(
    runPath: string,
    private options?: ProviderOptions,
  ) {
    const basePath = this.getBasePath();
    const { filePath: providerPath, functionName } = parsePathOrGlob(basePath, runPath);
    this.scriptPath = path.relative(basePath, providerPath);
    this.functionName = functionName || null;
    this.id = () => options?.id ?? `python:${this.scriptPath}:${this.functionName || 'default'}`;
    this.label = options?.label;
    this.config = options?.config ?? {};
  }

  id() {
    return `python:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  private getBasePath(): string {
    return this.options?.config.basePath || '';
  }

  private getAbsoluteScriptPath(): string {
    return path.resolve(path.join(this.getBasePath(), this.scriptPath));
  }

  private validateScriptExists(absPath: string): void {
    if (!fs.existsSync(absPath)) {
      const basePath = this.getBasePath();
      const errorMessage = dedent`
        Python provider script not found: ${chalk.bold(absPath)}

        ${chalk.white('Please verify that:')}
          - The file path is correct
          - The file exists at the specified location
          ${basePath ? `- The path is relative to: ${path.resolve(basePath)}` : '- The path is relative to the current directory'}

        ${chalk.white('For more information on Python providers, visit:')} ${chalk.cyan('https://promptfoo.dev/docs/providers/python/')}
      `;
      logger.error(errorMessage);
      throw new Error(`Python provider script not found: ${absPath}`);
    }
  }

  private validateResult(
    result: any,
    functionName: string,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): void {
    const apiTypeConfig: Record<
      typeof apiType,
      { requiredKey: string; keyDescription: string; typeDescription: string }
    > = {
      call_api: {
        requiredKey: 'output',
        keyDescription: '`output` string/object',
        typeDescription: 'an',
      },
      call_embedding_api: {
        requiredKey: 'embedding',
        keyDescription: '`embedding` array',
        typeDescription: 'an',
      },
      call_classification_api: {
        requiredKey: 'classification',
        keyDescription: '`classification` object',
        typeDescription: 'a',
      },
    };

    const config = apiTypeConfig[apiType];
    const isValidResult =
      result &&
      typeof result === 'object' &&
      (config.requiredKey in result || 'error' in result);

    if (!isValidResult) {
      throw new Error(
        `The Python script \`${functionName}\` function must return a dict with ${config.typeDescription} ${config.keyDescription} or \`error\` string, instead got: ${JSON.stringify(result)}`,
      );
    }
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
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization and store the promise
    this.initializationPromise = (async () => {
      try {
        this.config = await processConfigFileReferences(this.config, this.getBasePath());

        // Initialize worker pool
        const workerCount = this.getWorkerCount();
        const absPath = this.getAbsoluteScriptPath();

        this.validateScriptExists(absPath);

        this.pool = new PythonWorkerPool(
          absPath,
          this.functionName || 'call_api',
          workerCount,
          this.config.pythonExecutable,
          this.config.timeout,
        );

        await this.pool.initialize();

        // Register for cleanup
        providerRegistry.register(this);

        this.isInitialized = true;
        logger.debug(`Initialized Python provider ${this.id()} with ${workerCount} workers`);
      } catch (error) {
        // Reset the initialization promise so future calls can retry
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Determine worker count based on config and environment
   * Priority: config.workers > PROMPTFOO_PYTHON_WORKERS env > default 1
   */
  private getWorkerCount(): number {
    let count: number;

    // 1. Explicit config.workers
    if (this.config.workers !== undefined) {
      count = this.config.workers;
    }
    // 2. Environment variable
    else {
      const envWorkers = getEnvInt('PROMPTFOO_PYTHON_WORKERS');
      if (envWorkers !== undefined) {
        count = envWorkers;
      } else {
        // 3. Default: 1 worker (memory-efficient)
        count = 1;
      }
    }

    // Validate: must be at least 1
    if (count < 1) {
      logger.warn(`Invalid worker count ${count}, using minimum of 1`);
      return 1;
    }

    return count;
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
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    if (!this.isInitialized || !this.pool) {
      await this.initialize();
    }

    const absPath = this.getAbsoluteScriptPath();
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));

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

      // IMPORTANT: Set cached flag to true so evaluator recognizes this as cached
      if (apiType === 'call_api' && typeof parsedResult === 'object' && parsedResult !== null) {
        logger.debug(`PythonProvider setting cached=true for cached ${apiType} result`);
        parsedResult.cached = true;

        // Update token usage format for cached results
        if (parsedResult.tokenUsage) {
          const total = parsedResult.tokenUsage.total || 0;
          parsedResult.tokenUsage = {
            cached: total,
            total,
            numRequests: parsedResult.tokenUsage.numRequests ?? 1,
          };
          logger.debug(
            `Updated token usage for cached result: ${JSON.stringify(parsedResult.tokenUsage)}`,
          );
        }
      }
      return parsedResult;
    } else {
      if (context) {
        // Remove properties not useful in Python
        delete context.getCache;
        delete context.logger;
      }

      // Create a new options object with processed file references included in the config
      // This ensures any file:// references are replaced with their actual content
      const optionsWithProcessedConfig = {
        ...this.options,
        config: {
          ...this.options?.config,
          ...this.config, // Merge in the processed config containing resolved file references
        },
      };

      // Prepare arguments for the Python script based on API type
      const args =
        apiType === 'call_api'
          ? [prompt, optionsWithProcessedConfig, context]
          : [prompt, optionsWithProcessedConfig];

      logger.debug(
        `Executing python script ${absPath} via worker pool with args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      const result = await this.pool!.execute(functionName, args);

      // Log result structure for debugging (only for call_api)
      if (apiType === 'call_api') {
        logger.debug(
          `Python provider result structure: ${result ? typeof result : 'undefined'}, keys: ${result ? Object.keys(result).join(',') : 'none'}`,
        );
        if (result && 'output' in result) {
          logger.debug(
            `Python provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
          );
        }
      }

      this.validateResult(result, functionName, apiType);

      // Store result in cache if enabled and no errors
      const hasError =
        'error' in result &&
        result.error !== null &&
        result.error !== undefined &&
        result.error !== '';

      if (isCacheEnabled() && !hasError) {
        logger.debug(`PythonProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      } else {
        logger.debug(
          `PythonProvider not caching result: ${isCacheEnabled() ? (hasError ? 'has error' : 'unknown reason') : 'cache disabled'}`,
        );
      }

      // Set cached=false on fresh results and ensure numRequests is set
      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        logger.debug(`PythonProvider explicitly setting cached=false for fresh result`);
        result.cached = false;

        // Ensure tokenUsage includes numRequests for fresh results
        if (result.tokenUsage && !result.tokenUsage.numRequests) {
          result.tokenUsage.numRequests = 1;
          logger.debug(
            `Added numRequests to fresh result token usage: ${JSON.stringify(result.tokenUsage)}`,
          );
        }
      }

      return result;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    return this.executePythonScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }

  async shutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.shutdown();
      this.pool = null;
    }
    providerRegistry.unregister(this);
    this.isInitialized = false;
  }
}
