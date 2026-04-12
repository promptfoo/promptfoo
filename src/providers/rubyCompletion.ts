import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { runRuby } from '../ruby/rubyUtils';
import { sha256 } from '../util/createHash';
import { processConfigFileReferences } from '../util/fileReference';
import { parsePathOrGlob } from '../util/index';
import { safeJsonStringify } from '../util/json';
import { sanitizeScriptContext } from './scriptContext';

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

type RubyApiType = 'call_api' | 'call_embedding_api' | 'call_classification_api';

function buildRubyScriptArgs(
  apiType: RubyApiType,
  prompt: string,
  optionsWithProcessedConfig: ProviderOptions,
  sanitizedContext: CallApiContextParams | undefined,
) {
  return apiType === 'call_api'
    ? [prompt, optionsWithProcessedConfig, sanitizedContext]
    : [prompt, optionsWithProcessedConfig];
}

function hasRubyResultProperty(
  result: any,
  propertyName: 'output' | 'error' | 'embedding' | 'classification',
): boolean {
  return (
    Boolean(result) &&
    typeof result === 'object' &&
    Object.prototype.hasOwnProperty.call(result, propertyName)
  );
}

function applyCachedRubyCallApiMetadata(apiType: RubyApiType, parsedResult: any) {
  if (apiType !== 'call_api' || typeof parsedResult !== 'object' || parsedResult === null) {
    return parsedResult;
  }

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

  return parsedResult;
}

function applyFreshRubyCallApiMetadata(apiType: RubyApiType, result: any) {
  if (apiType !== 'call_api' || typeof result !== 'object' || result === null) {
    return result;
  }

  logger.debug(`RubyProvider explicitly setting cached=false for fresh result`);
  result.cached = false;

  // Unlike Python's applyFreshCallApiMetadata, Ruby does not backfill
  // tokenUsage.numRequests on fresh results. This preserves the historical
  // fresh-result shape that Ruby scripts and downstream consumers already
  // depend on — changing it would break backward compatibility.
  return result;
}

function hasRubyResultError(result: any): boolean {
  // Must stay consistent with validateRubyCallApiResult's own-property check:
  // loosening this to `'error' in result` without also loosening validation
  // would let a script return an error on the prototype chain, pass validation
  // via an own `output`, and then be cached as a successful result — a
  // cache-poisoning vector.
  return (
    hasRubyResultProperty(result, 'error') &&
    result.error !== null &&
    result.error !== undefined &&
    result.error !== ''
  );
}

function validateRubyCallApiResult(functionName: string, result: any): void {
  // Log result structure for debugging
  const resultType = result === null ? 'null' : typeof result;
  const resultKeys = result && typeof result === 'object' ? Object.keys(result).join(',') : 'none';
  logger.debug(`Ruby provider result structure: ${resultType}, keys: ${resultKeys}`);
  if (hasRubyResultProperty(result, 'output')) {
    logger.debug(
      `Ruby provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
    );
  }

  if (!hasRubyResultProperty(result, 'output') && !hasRubyResultProperty(result, 'error')) {
    throw new Error(
      `The Ruby script \`${functionName}\` function must return a hash with an own \`output\` string/object or \`error\` string (inherited prototype properties are rejected), instead got: ${JSON.stringify(
        result,
      )}`,
    );
  }
}

function validateRubyEmbeddingResult(functionName: string, result: any): void {
  if (!hasRubyResultProperty(result, 'embedding') && !hasRubyResultProperty(result, 'error')) {
    throw new Error(
      `The Ruby script \`${functionName}\` function must return a hash with an own \`embedding\` array or \`error\` string (inherited prototype properties are rejected), instead got ${JSON.stringify(
        result,
      )}`,
    );
  }
}

function validateRubyClassificationResult(functionName: string, result: any): void {
  if (!hasRubyResultProperty(result, 'classification') && !hasRubyResultProperty(result, 'error')) {
    throw new Error(
      `The Ruby script \`${functionName}\` function must return a hash with an own \`classification\` object or \`error\` string (inherited prototype properties are rejected), instead of ${JSON.stringify(
        result,
      )}`,
    );
  }
}

function validateRubyScriptResult(apiType: RubyApiType, functionName: string, result: any): void {
  switch (apiType) {
    case 'call_api':
      validateRubyCallApiResult(functionName, result);
      return;
    case 'call_embedding_api':
      validateRubyEmbeddingResult(functionName, result);
      return;
    case 'call_classification_api':
      validateRubyClassificationResult(functionName, result);
      return;
    default:
      throw new Error(`Unsupported apiType: ${apiType}`);
  }
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
    apiType: RubyApiType,
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
      return applyCachedRubyCallApiMetadata(apiType, parsedResult);
    } else {
      const sanitizedContext = sanitizeScriptContext('RubyProvider', context);

      // Create a new options object with processed file references included in the config
      // This ensures any file:// references are replaced with their actual content
      const optionsWithProcessedConfig = {
        ...this.options,
        config: {
          ...this.options?.config,
          ...this.config, // Merge in the processed config containing resolved file references
        },
      };

      const args = buildRubyScriptArgs(
        apiType,
        prompt,
        optionsWithProcessedConfig,
        sanitizedContext,
      );

      logger.debug(
        `Running ruby script ${absPath} with scriptPath ${this.scriptPath} and args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      const result = await runRuby(absPath, functionName, args, {
        rubyExecutable: this.config.rubyExecutable,
      });

      validateRubyScriptResult(apiType, functionName, result);

      // Store result in cache if enabled and no errors
      const hasError = hasRubyResultError(result);

      if (isCacheEnabled() && !hasError) {
        logger.debug(`RubyProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      } else {
        logger.debug(
          `RubyProvider not caching result: ${isCacheEnabled() ? (hasError ? 'has error' : 'unknown reason') : 'cache disabled'}`,
        );
      }

      // Set cached=false on fresh results
      return applyFreshRubyCallApiMetadata(apiType, result);
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
