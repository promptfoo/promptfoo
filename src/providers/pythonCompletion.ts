import path from 'path';

import { PythonShell, Options as PythonShellOptions } from 'python-shell';

import logger from '../logger';
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
    const absPath = path.resolve(path.join(this.options?.config.basePath, this.scriptPath));
    const options: PythonShellOptions = {
      mode: 'text',
      pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
      scriptPath: path.join(__dirname),
      args: [absPath, prompt, JSON.stringify(this.options), JSON.stringify(context)],
    };

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
    return result.data;
  }
}

