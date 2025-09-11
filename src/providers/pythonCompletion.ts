import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { PersistentPythonManager } from '../python/persistentPythonManager';
import { runPython } from '../python/pythonUtils';
import { parsePathOrGlob } from '../util';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { safeJsonStringify } from '../util/json';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types';

interface PythonProviderConfig {
  pythonExecutable?: string;
  // Internal/legacy config for backwards compatibility
  persistent?: boolean;
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private persistentManager: PersistentPythonManager | null = null;
  public label: string | undefined;

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
   * Process any file:// references in the configuration and optionally initialize persistent mode
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
        this.config = await processConfigFileReferences(
          this.config,
          this.options?.config.basePath || '',
        );

        // Initialize persistent mode (enabled by default, can be disabled with persistent: false)
        if (this.config.persistent !== false) {
          const absPath = path.resolve(
            path.join(this.options?.config.basePath || '', this.scriptPath),
          );

          this.persistentManager = new PersistentPythonManager(absPath, {
            pythonExecutable: this.config.pythonExecutable,
          });

          // Handle critical errors from persistent manager to prevent crashes
          this.persistentManager.on('error', (error) => {
            logger.error(`Persistent Python manager fatal error: ${error.message}`);
            logger.warn('Disabling persistent mode for this provider, falling back to traditional execution');
            
            // Disable persistent manager to force fallback to traditional mode
            this.persistentManager?.shutdown();
            this.persistentManager = null;
          });

          await this.persistentManager.initialize();
          logger.debug(`Initialized persistent Python provider ${this.id()}`);
        } else {
          logger.debug(`Persistent mode disabled for provider ${this.id()}, using traditional execution`);
        }

        this.isInitialized = true;
        logger.debug(`Initialized Python provider ${this.id()}`);
      } catch (error) {
        // Reset the initialization promise so future calls can retry
        this.initializationPromise = null;

        // Cleanup persistent manager if initialization failed
        if (this.persistentManager) {
          this.persistentManager.shutdown();
          this.persistentManager = null;
        }

        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Execute the Python script using persistent mode
   * Handles caching and context serialization for persistent execution
   *
   * @param prompt - The prompt to pass to the Python script
   * @param context - Optional context information
   * @param apiType - The type of API to call (call_api, call_embedding_api, call_classification_api)
   * @returns The response from the Python script
   */
  private async executePersistentScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    if (!this.persistentManager) {
      throw new Error('Persistent manager not initialized');
    }

    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for persistent script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));

    // Create cache key for persistent mode (using safe JSON stringify to avoid circular references)
    const cacheKey = `python-persistent:${this.scriptPath}:${this.functionName || 'default'}:${apiType}:${fileHash}:${prompt}:${safeJsonStringify(
      this.options,
    )}:${safeJsonStringify(context?.vars)}`;
    logger.debug(`PersistentPythonProvider cache key: ${cacheKey}`);

    const cache = await getCache();
    let cachedResult;
    const cacheEnabled = isCacheEnabled();

    if (cacheEnabled) {
      cachedResult = await cache.get(cacheKey);
      logger.debug(`PersistentPythonProvider cache hit: ${Boolean(cachedResult)}`);
    }

    if (cachedResult) {
      logger.debug(`Returning cached ${apiType} result for persistent script ${absPath}`);
      const parsedResult = JSON.parse(cachedResult as string);

      // Set cached flag to true
      if (apiType === 'call_api' && typeof parsedResult === 'object' && parsedResult !== null) {
        parsedResult.cached = true;

        // Update token usage format for cached results
        if (parsedResult.tokenUsage) {
          const total = parsedResult.tokenUsage.total || 0;
          parsedResult.tokenUsage = {
            cached: total,
            total,
          };
        }
      }
      return parsedResult;
    }

    // Prepare context for serialization (removing non-serializable objects)
    const safeContext = context ? { ...context } : {};
    if (safeContext) {
      // Remove non-serializable properties
      delete (safeContext as any).getCache;
      delete (safeContext as any).logger;
    }

    // Create options with processed config
    const optionsWithProcessedConfig = {
      ...this.options,
      config: {
        ...this.options?.config,
        ...this.config,
      },
    };

    // Prepare arguments based on API type
    const args =
      apiType === 'call_api'
        ? [prompt, optionsWithProcessedConfig, safeContext]
        : [prompt, optionsWithProcessedConfig];

    logger.debug(
      `Running persistent python script ${absPath} with method ${this.functionName || apiType} and args: ${safeJsonStringify(args)}`,
    );

    const functionName = this.functionName || apiType;
    let result;

    try {
      result = await this.persistentManager.callMethod(
        functionName,
        args,
        optionsWithProcessedConfig,
        safeContext,
      );

      // Validate result based on API type
      if (apiType === 'call_api') {
        if (
          !result ||
          typeof result !== 'object' ||
          (!('output' in result) && !('error' in result))
        ) {
          throw new Error(
            `The Python script \`${functionName}\` function must return a dict with an \`output\` string/object or \`error\` string, instead got: ${JSON.stringify(result)}`,
          );
        }
      } else if (apiType === 'call_embedding_api') {
        if (
          !result ||
          typeof result !== 'object' ||
          (!('embedding' in result) && !('error' in result))
        ) {
          throw new Error(
            `The Python script \`${functionName}\` function must return a dict with an \`embedding\` array or \`error\` string, instead got ${JSON.stringify(result)}`,
          );
        }
      } else if (apiType === 'call_classification_api') {
        if (
          !result ||
          typeof result !== 'object' ||
          (!('classification' in result) && !('error' in result))
        ) {
          throw new Error(
            `The Python script \`${functionName}\` function must return a dict with a \`classification\` object or \`error\` string, instead of ${JSON.stringify(result)}`,
          );
        }
      }

      // Store result in cache if enabled and no errors
      const hasError =
        'error' in result &&
        result.error !== null &&
        result.error !== undefined &&
        result.error !== '';

      if (isCacheEnabled() && !hasError) {
        logger.debug(`PersistentPythonProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      }

      // Set cached=false on fresh results
      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        result.cached = false;
      }

      return result;
    } catch (error) {
      logger.error(`Persistent Python execution failed: ${error}`);
      throw error;
    }
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
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
        `Running python script ${absPath} with scriptPath ${this.scriptPath} and args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      let result;

      switch (apiType) {
        case 'call_api':
          result = await runPython(absPath, functionName, args, {
            pythonExecutable: this.config.pythonExecutable,
          });

          // Log result structure for debugging
          logger.debug(
            `Python provider result structure: ${result ? typeof result : 'undefined'}, keys: ${result ? Object.keys(result).join(',') : 'none'}`,
          );
          if (result && 'output' in result) {
            logger.debug(
              `Python provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
            );
          }

          if (
            !result ||
            typeof result !== 'object' ||
            (!('output' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with an \`output\` string/object or \`error\` string, instead got: ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_embedding_api':
          result = await runPython(absPath, functionName, args, {
            pythonExecutable: this.config.pythonExecutable,
          });

          if (
            !result ||
            typeof result !== 'object' ||
            (!('embedding' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with an \`embedding\` array or \`error\` string, instead got ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_classification_api':
          result = await runPython(absPath, functionName, args, {
            pythonExecutable: this.config.pythonExecutable,
          });

          if (
            !result ||
            typeof result !== 'object' ||
            (!('classification' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with a \`classification\` object or \`error\` string, instead of ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        default:
          throw new Error(`Unsupported apiType: ${apiType}`);
      }

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

      // Set cached=false on fresh results
      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        logger.debug(`PythonProvider explicitly setting cached=false for fresh result`);
        result.cached = false;
      }

      return result;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Use persistent mode if available
    if (this.persistentManager && this.persistentManager.isHealthy) {
      try {
        return await this.executePersistentScript(prompt, context, 'call_api');
      } catch (error) {
        logger.warn(`Persistent mode failed, falling back to traditional execution: ${error}`);
        // Fall through to traditional execution
      }
    }

    return this.executePythonScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Use persistent mode if available
    if (this.persistentManager && this.persistentManager.isHealthy) {
      try {
        return await this.executePersistentScript(prompt, undefined, 'call_embedding_api');
      } catch (error) {
        logger.warn(`Persistent mode failed for embedding API, falling back: ${error}`);
        // Fall through to traditional execution
      }
    }

    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Use persistent mode if available
    if (this.persistentManager && this.persistentManager.isHealthy) {
      try {
        return await this.executePersistentScript(prompt, undefined, 'call_classification_api');
      } catch (error) {
        logger.warn(`Persistent mode failed for classification API, falling back: ${error}`);
        // Fall through to traditional execution
      }
    }

    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }

  /**
   * Cleanup method called when provider is no longer needed
   * Shuts down the persistent Python process if running
   */
  cleanup(): void {
    if (this.persistentManager) {
      logger.debug(`Shutting down persistent Python manager for ${this.id()}`);
      this.persistentManager.shutdown();
      this.persistentManager = null;
    }
  }
}
