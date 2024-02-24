import path from 'path';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';
import { runPython } from '../python/wrapper';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';

export class PythonProvider implements ApiProvider {
  constructor(private scriptPath: string, private options?: ProviderOptions) {}

  id() {
    return `python:${this.scriptPath}`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const cacheKey = `python:${this.scriptPath}:${prompt}:${JSON.stringify(this.options)}`;
    const cache = await getCache();
    let cachedResult;

    if (isCacheEnabled()) {
      cachedResult = (await cache.get(cacheKey)) as string;
    }

    const absPath = path.resolve(
      path.join(this.options?.config.basePath || __dirname, this.scriptPath),
    );
    if (cachedResult) {
      logger.debug(`Returning cached result for script ${absPath}`);
      return JSON.parse(cachedResult);
    } else {
      const args = [prompt, JSON.stringify(this.options), JSON.stringify(context)];
      logger.debug(
        `Running python script ${absPath} with scriptPath ${this.scriptPath} and args: ${args.join(
          '\n',
        )}`,
      );
      const result = (await runPython(absPath, 'call_api', args)) as {output?: string; error?: string}
      if (!('output' in result) && !('error' in result)) {
        throw new Error(
          'The Python script `call_api` function must return a dict with an `output` or `error` string',
        );
      }
      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(result));
      }
      return result;
    }
  }
}
