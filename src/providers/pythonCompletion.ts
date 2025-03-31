import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { getCache, isCacheEnabled } from '../cache';
import { importModule } from '../esm';
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
import { isJavascriptFile } from '../util/file';
import { safeJsonStringify } from '../util/json';

interface PythonProviderConfig {
  pythonExecutable?: string;
}

/**
 * Process a file reference string and return the loaded content
 * @param fileRef The file reference string (e.g. 'file://path/to/file.json')
 * @param basePath Base path for resolving relative paths
 * @returns The loaded content from the file
 */
async function loadFileReference(fileRef: string, basePath: string = ''): Promise<any> {
  // Remove the file:// prefix
  const pathWithProtocolRemoved = fileRef.slice('file://'.length);

  // Split to check for function name
  const parts = pathWithProtocolRemoved.split(':');
  const filePath = parts[0];
  const functionName = parts.length > 1 ? parts[1] : undefined;

  // Resolve the absolute path
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  logger.debug(
    `Loading file reference: ${fileRef}, resolvedPath: ${resolvedPath}, extension: ${extension}`,
  );

  try {
    if (extension === '.json') {
      logger.debug(`Loading JSON file: ${resolvedPath}`);
      const content = fs.readFileSync(resolvedPath, 'utf8');
      return JSON.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      logger.debug(`Loading YAML file: ${resolvedPath}`);
      const content = fs.readFileSync(resolvedPath, 'utf8');
      return yaml.load(content);
    } else if (isJavascriptFile(resolvedPath)) {
      logger.debug(`Loading JavaScript file: ${resolvedPath}`);
      const mod = await importModule(resolvedPath, functionName);
      return typeof mod === 'function' ? await mod() : mod;
    } else if (extension === '.py') {
      logger.debug(
        `Loading Python file: ${resolvedPath}, function: ${functionName || 'get_config'}`,
      );
      const fnName = functionName || 'get_config';
      const result = await runPython(resolvedPath, fnName, []);
      return result;
    } else if (extension === '.txt' || extension === '.md' || extension === '') {
      // For text files, just return the content as a string
      logger.debug(`Loading text file: ${resolvedPath}`);
      return fs.readFileSync(resolvedPath, 'utf8');
    } else {
      logger.debug(`Unsupported file extension: ${extension}`);
      throw new Error(`Unsupported file extension: ${extension}`);
    }
  } catch (error) {
    logger.error(`Error loading file reference ${fileRef}: ${error}`);
    throw error;
  }
}

/**
 * Recursively processes a configuration object, replacing any file:// references
 * with the content of the referenced files
 * @param config The configuration object to process
 * @param basePath Base path for resolving relative paths
 * @returns A new configuration object with file references resolved
 */
async function processConfigFileReferences(config: any, basePath: string = ''): Promise<any> {
  if (!config) {
    return config;
  }

  // Handle string values with file:// protocol
  if (typeof config === 'string' && config.startsWith('file://')) {
    return await loadFileReference(config, basePath);
  }

  // Handle arrays
  if (Array.isArray(config)) {
    const result = [];
    for (const item of config) {
      result.push(await processConfigFileReferences(item, basePath));
    }
    return result;
  }

  // Handle objects
  if (typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = await processConfigFileReferences(value, basePath);
    }
    return result;
  }

  // Return primitive values as is
  return config;
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

  private async executePythonScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    // Ensure config references are processed before execution
    if (!this.configReferencesProcessed) {
      await this.processConfigReferences();
    }

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
