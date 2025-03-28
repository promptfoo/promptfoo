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
import { safeJsonStringify } from '../util/json';

interface PythonProviderConfig {
  pythonExecutable?: string;
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
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

  private async executePythonScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));
    // Create a cache key that includes the function name to ensure different functions
    // from the same Python file don't share caches
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

        // If there's token usage information, update it to reflect cached status
        if (parsedResult.tokenUsage) {
          const total = parsedResult.tokenUsage.total || 0;

          // Transform the token usage to match the cached format expected by the evaluator
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
        // These are not useful in Python
        delete context.fetchWithCache;
        delete context.getCache;
        delete context.logger;
      }

      const args =
        apiType === 'call_api' ? [prompt, this.options, context] : [prompt, this.options];
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

          // Add detailed logging about the result structure
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

      // Store in cache if caching is enabled and there are no errors
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
    return this.executePythonScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    return this.executePythonScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    return this.executePythonScript(prompt, undefined, 'call_classification_api');
  }
}
