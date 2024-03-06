import path from 'path';

import { PythonShell, Options as PythonShellOptions } from 'python-shell';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';

export class PythonProvider implements ApiProvider {
  constructor(private scriptPath: string, private options?: ProviderOptions) {}

  get model() {
    return `python:${this.scriptPath}`;
  }

  get label() {
    return this.options?.label || this.model;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const absPath = path.resolve(path.join(this.options?.config.basePath, this.scriptPath));
    const options: PythonShellOptions = {
      mode: 'text',
      pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
      scriptPath: path.join(__dirname),
      args: [absPath, prompt, JSON.stringify(this.options), JSON.stringify(context)],
    };

    const cacheKey = `python:${this.scriptPath}:${prompt}:${JSON.stringify(this.options)}`;
    const cache = await getCache();
    let cachedResult;

    if (isCacheEnabled()) {
      cachedResult = (await cache.get(cacheKey)) as string;
    }

    if (cachedResult) {
      logger.debug(`Returning cached result for script ${absPath}`);
      return JSON.parse(cachedResult);
    } else {
      logger.debug(`Running python script ${absPath} with scriptPath ${this.scriptPath} and args ${JSON.stringify(options.args)}`);
      const results = await PythonShell.run('./wrapper.py', options);
      logger.debug(`Python script ${absPath} returned: ${results.join('\n')}`);
      const result: {type: 'final_result', data: ProviderResponse} = JSON.parse(results[results.length - 1]);
      if (result?.type !== 'final_result') {
        throw new Error('The Python script `call_api` function must return a dict with an `output` or `error` string');
      }
      if (!('output' in result.data) && !('error' in result.data)) {
        throw new Error('The Python script `call_api` function must return a dict with an `output` or `error` string');
      }
      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(result.data));
      }
      return result.data;
    }
  }
}
