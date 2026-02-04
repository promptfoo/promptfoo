import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { runRuby } from '../ruby/rubyUtils';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { parsePathOrGlob } from '../util/index';
import { safeJsonStringify } from '../util/json';
import { sanitizeContext } from '../util/transform';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

interface RubyProviderConfig {
  rubyExecutable?: string;
}

/**
 * Ruby provider for executing custom Ruby scripts as API providers.
 * Supports text generation, embeddings, and classification tasks.
 */
export class RubyProvider implements ApiProvider {
  config: RubyProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  public id: () => string;
  public label: string | undefined;

  /**
   * Creates a new Ruby provider instance.
   * @param runPath - Path to the Ruby script, optionally with function name (e.g., "script.rb:function_name")
   * @param options - Provider configuration options
   */
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
    this.label = options?.label;
    this.config = options?.config ?? {};
    this.id = () => options?.id ?? `ruby:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  /**
   * Process any file:// references in the configuration
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

    // Start initialization and store the promise
    this.initializationPromise = (async () => {
      try {
        this.config = await processConfigFileReferences(
          this.config,
          this.options?.config.basePath || '',
        );
        this.isInitialized = true;
        logger.debug(`Initialized Ruby provider ${this.id()}`);
      } catch (error) {
        // Reset the initialization promise so future calls can retry
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Execute the Ruby script with the specified API type
   * Handles caching, file reference processing, and executing the Ruby script
   *
   * @param prompt - The prompt to pass to the Ruby script
   * @param context - Optional context information
   * @param apiType - The type of API to call (call_api, call_embedding_api, call_classification_api)
   * @returns The response from the Ruby script
   */
  private async executeRubyScript(
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
    const cacheKey = `ruby:${this.scriptPath}:${this.functionName || 'default'}:${apiType}:${fileHash}:${prompt}:${safeJsonStringify(
      this.options,
    )}:${safeJsonStringify(context?.vars)}`;
    logger.debug(`RubyProvider cache key: ${cacheKey}`);

    const cache = await getCache();
    let cachedResult;
    const cacheEnabled = isCacheEnabled();
    logger.debug(`RubyProvider cache enabled: ${cacheEnabled}`);

    if (cacheEnabled) {
      cachedResult = await cache.get(cacheKey);
      logger.debug(`RubyProvider cache hit: ${Boolean(cachedResult)}`);
    }

    if (cachedResult) {
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      const parsedResult = JSON.parse(cachedResult as string);

      logger.debug(
        `RubyProvider parsed cached result type: ${typeof parsedResult}, keys: ${Object.keys(parsedResult).join(',')}`,
      );

      // IMPORTANT: Set cached flag to true so evaluator recognizes this as cached
      if (apiType === 'call_api' && typeof parsedResult === 'object' && parsedResult !== null) {
        logger.debug(`RubyProvider setting cached=true for cached ${apiType} result`);
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
      // Create a sanitized copy of context for Ruby
      // Remove non-serializable properties that break JSON serialization
      const sanitizedContext = context
        ? sanitizeContext({ ...context } as unknown as Record<string, unknown>)
        : undefined;

      // Create a new options object with processed file references included in the config
      // This ensures any file:// references are replaced with their actual content
      const optionsWithProcessedConfig = {
        ...this.options,
        config: {
          ...this.options?.config,
          ...this.config, // Merge in the processed config containing resolved file references
        },
      };

      // Prepare arguments for the Ruby script based on API type
      const args =
        apiType === 'call_api'
          ? [prompt, optionsWithProcessedConfig, sanitizedContext]
          : [prompt, optionsWithProcessedConfig];

      logger.debug(
        `Running ruby script ${absPath} with scriptPath ${this.scriptPath} and args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      let result: any;

      switch (apiType) {
        case 'call_api':
          result = await runRuby(absPath, functionName, args, {
            rubyExecutable: this.config.rubyExecutable,
          });

          // Log result structure for debugging
          logger.debug(
            `Ruby provider result structure: ${result ? typeof result : 'undefined'}, keys: ${result && typeof result === 'object' ? Object.keys(result).join(',') : 'none'}`,
          );
          if (result && typeof result === 'object' && 'output' in result) {
            logger.debug(
              `Ruby provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
            );
          }

          if (
            !result ||
            typeof result !== 'object' ||
            (!('output' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Ruby script \`${functionName}\` function must return a hash with an \`output\` string/object or \`error\` string, instead got: ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_embedding_api':
          result = await runRuby(absPath, functionName, args, {
            rubyExecutable: this.config.rubyExecutable,
          });

          if (
            !result ||
            typeof result !== 'object' ||
            (!('embedding' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Ruby script \`${functionName}\` function must return a hash with an \`embedding\` array or \`error\` string, instead got ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_classification_api':
          result = await runRuby(absPath, functionName, args, {
            rubyExecutable: this.config.rubyExecutable,
          });

          if (
            !result ||
            typeof result !== 'object' ||
            (!('classification' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Ruby script \`${functionName}\` function must return a hash with a \`classification\` object or \`error\` string, instead of ${JSON.stringify(
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
        logger.debug(`RubyProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      } else {
        logger.debug(
          `RubyProvider not caching result: ${isCacheEnabled() ? (hasError ? 'has error' : 'unknown reason') : 'cache disabled'}`,
        );
      }

      // Set cached=false on fresh results
      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        logger.debug(`RubyProvider explicitly setting cached=false for fresh result`);
        result.cached = false;
      }

      return result;
    }
  }

  /**
   * Calls the Ruby script for text generation.
   * @param prompt - The input prompt to send to the Ruby script
   * @param context - Optional context with variables and metadata
   * @returns Provider response with output, token usage, and other metadata
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    return this.executeRubyScript(prompt, context, 'call_api');
  }

  /**
   * Calls the Ruby script for embedding generation.
   * @param prompt - The input text to generate embeddings for
   * @returns Provider response with embedding array
   */
  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    return this.executeRubyScript(prompt, undefined, 'call_embedding_api');
  }

  /**
   * Calls the Ruby script for classification tasks.
   * @param prompt - The input text to classify
   * @returns Provider response with classification results
   */
  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    return this.executeRubyScript(prompt, undefined, 'call_classification_api');
  }
}
