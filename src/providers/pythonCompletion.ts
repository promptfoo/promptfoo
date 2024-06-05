import path from 'path';
import fs from 'fs';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';
import { runPython } from '../python/wrapper';
import { sha256 } from '../util';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
  ProviderEmbeddingResponse,
  ProviderClassificationResponse,
} from '../types';

interface PythonProviderConfig {
  pythonExecutable?: string;
}

export class PythonProvider implements ApiProvider {
  private config: PythonProviderConfig;

  constructor(private scriptPath: string, private options?: ProviderOptions) {
    this.id = () => options?.id ?? `python:${this.scriptPath}`;
    this.config = options?.config ?? {};
  }

  id() {
    return `python:${this.scriptPath}`;
  }

  private async executePythonScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));
    const cacheKey = `python:${this.scriptPath}:${apiType}:${fileHash}:${prompt}:${JSON.stringify(
      this.options,
    )}`;
    const cache = await getCache();
    let cachedResult;

    if (isCacheEnabled()) {
      cachedResult = (await cache.get(cacheKey)) as string;
    }

    if (cachedResult) {
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      return JSON.parse(cachedResult);
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
        `Running python script ${absPath} with scriptPath ${this.scriptPath} and args: ${args.join(
          '\n',
        )}`,
      );
      let result;
      switch (apiType) {
        case 'call_api':
          result = (await runPython(absPath, apiType, args, {
            pythonExecutable: this.config.pythonExecutable,
          })) as ProviderResponse;
          if (!('output' in result) && !('error' in result)) {
            throw new Error(
              `The Python script \`${apiType}\` function must return a dict with an \`output\` string/object or \`error\` string, instead got: ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_embedding_api':
          result = (await runPython(absPath, apiType, args, {
            pythonExecutable: this.config.pythonExecutable,
          })) as ProviderEmbeddingResponse;
          if (!('embedding' in result) && !('error' in result)) {
            throw new Error(
              `The Python script \`${apiType}\` function must return a dict with an \`embedding\` array or \`error\` string, instead got ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_classification_api':
          result = (await runPython(absPath, apiType, args, {
            pythonExecutable: this.config.pythonExecutable,
          })) as ProviderClassificationResponse;
          if (!('classification' in result) && !('error' in result)) {
            throw new Error(
              `The Python script \`${apiType}\` function must return a dict with a \`classification\` object or \`error\` string, instead of ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        default:
          throw new Error(`Unsupported apiType: ${apiType}`);
      }

      if (isCacheEnabled() && !('error' in result)) {
        await cache.set(cacheKey, JSON.stringify(result));
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
