import fs from 'fs';
import path from 'path';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
  ProviderEmbeddingResponse,
  ProviderClassificationResponse,
} from '../types';
import { parsePathOrGlob } from '../util';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { safeJsonStringify } from '../util/json';

interface PythonProviderConfig {
  pythonExecutable?: string;
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private configReferencesProcessed: boolean = false;
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
   * Process any file:// references in the configuration
   * This should be called after initialization
   * @returns A promise that resolves when all file references have been processed
   */
  public async processConfigReferences(): Promise<void> {
    // Skip if already processed
    if (this.configReferencesProcessed) {
      return;
    }

    try {
      const basePath = this.options?.config.basePath || '';
      this.config = await processConfigFileReferences(this.config, basePath);
      this.configReferencesProcessed = true;
      logger.debug(`Processed file references in config for ${this.id()}`);
    } catch (error) {
      logger.error(`Error processing file references in config for ${this.id()}: ${error}`);
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
    // Ensure file references in config are processed before execution
    if (!this.configReferencesProcessed) {
      await this.processConfigReferences();
    }

    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));

    // Create cache key including the function name to ensure different functions don't share caches
    const cacheKey = `python:${this.scriptPath}:${this.functionName || 'default'}:${apiType}:${fileHash}:${prompt}:${JSON.stringify(
      this.options,
    )}:${JSON.stringify(context?.vars)}`;
    logger.debug(`PythonProvider cache key: ${cacheKey}`);

    // Check cache if enabled
    const cache = await getCache();
    let cachedResult;
    const cacheEnabled = isCacheEnabled();
    logger.debug(`PythonProvider cache enabled: ${cacheEnabled}`);

    if (cacheEnabled) {
      cachedResult = await cache.get(cacheKey);
      logger.debug(`PythonProvider cache hit: ${Boolean(cachedResult)}`);
    }

    if (cachedResult) {
      // Return cached result if available
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      const parsedResult = JSON.parse(cachedResult as string);

      logger.debug(
        `PythonProvider parsed cached result type: ${typeof parsedResult}, keys: ${Object.keys(parsedResult).join(',')}`,
      );

      // Mark as cached so evaluator recognizes it
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
      // Execute Python script with processed configuration
      if (context) {
        // Remove properties not useful in Python
        delete context.fetchWithCache;
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

      // Log the processed configuration for debugging
      logger.debug(`Using processed config: ${safeJsonStringify(this.config)}`);
      logger.debug(
        `Combined options with processed config: ${safeJsonStringify(optionsWithProcessedConfig)}`,
      );

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

      // Execute the appropriate API call
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

          // Validate result format
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

          // Validate embedding result format
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

          // Validate classification result format
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

      // Mark as not cached for fresh results
      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        logger.debug(`PythonProvider explicitly setting cached=false for fresh result`);
        result.cached = false;
      }

      return result;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Ensure config references are processed before calling API
    if (!this.configReferencesProcessed) {
      await this.processConfigReferences();
    }
    return this.executePythonScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    // Ensure config references are processed before calling API
    if (!this.configReferencesProcessed) {
      await this.processConfigReferences();
    }
    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    // Ensure config references are processed before calling API
    if (!this.configReferencesProcessed) {
      await this.processConfigReferences();
    }
    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }
}
