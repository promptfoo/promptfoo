import { execFile } from 'child_process';

import invariant from 'tiny-invariant';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';
import { safeJsonStringify } from '../util';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export class ScriptCompletionProvider implements ApiProvider {
  constructor(
    private scriptPath: string,
    private options?: ProviderOptions,
  ) {}

  id() {
    return `exec:${this.scriptPath}`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const cacheKey = `exec:${this.scriptPath}:${prompt}:${JSON.stringify(this.options)}`;
    const cache = await getCache();
    let cachedResult;

    if (isCacheEnabled()) {
      cachedResult = await cache.get(cacheKey);
    }

    if (cachedResult) {
      logger.debug(`Returning cached result for script ${this.scriptPath}`);
      return JSON.parse(cachedResult as string);
    } else {
      return new Promise<ProviderResponse>((resolve, reject) => {
        const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
        let match;
        const scriptParts = [];

        while ((match = scriptPartsRegex.exec(this.scriptPath)) !== null) {
          // If it's a quoted match, push the first group (ignoring the quotes)
          if (match[1]) {
            scriptParts.push(match[1]);
          } else if (match[2]) {
            // If it's a single-quoted match, push the second group (ignoring the quotes)
            scriptParts.push(match[2]);
          } else {
            // Otherwise, push the whole match
            scriptParts.push(match[0]);
          }
        }
        const command = scriptParts.shift();
        invariant(command, 'No command found in script path');
        // These are not useful in the shell
        delete context?.fetchWithCache;
        delete context?.getCache;
        delete context?.logger;
        const scriptArgs = scriptParts.concat([
          prompt,
          safeJsonStringify(this.options || {}),
          safeJsonStringify(context || {}),
        ]);
        const options = this.options?.config.basePath ? { cwd: this.options.config.basePath } : {};

        execFile(command, scriptArgs, options, async (error, stdout, stderr) => {
          if (error) {
            logger.debug(`Error running script ${this.scriptPath}: ${error.message}`);
            reject(error);
            return;
          }
          const standardOutput = stripText(String(stdout).trim());
          const errorOutput = stripText(String(stderr).trim());
          if (errorOutput) {
            logger.debug(`Error output from script ${this.scriptPath}: ${errorOutput}`);
            if (!standardOutput) {
              reject(new Error(errorOutput));
              return;
            }
          }
          logger.debug(`Output from script ${this.scriptPath}: ${standardOutput}`);
          const result = { output: standardOutput };
          if (isCacheEnabled()) {
            await cache.set(cacheKey, JSON.stringify(result));
          }
          resolve(result);
        });
      });
    }
  }
}
