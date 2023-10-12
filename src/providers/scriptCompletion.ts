import logger from '../logger';
import { exec } from 'child_process';

import { ApiProvider, ProviderOptions, ProviderResponse } from '../types';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export class ScriptCompletionProvider implements ApiProvider {
  constructor(private scriptPath: string, private config?: ProviderOptions) {}

  id() {
    return `exec:${this.scriptPath}`;
  }

  async callApi(prompt: string) {
    return new Promise((resolve, reject) => {
      // TODO(ian): This config is real ugly.
      const command = this.config?.config.basePath
        ? `cd ${this.config.config.basePath} && ${this.scriptPath} "${prompt}"`
        : `${this.scriptPath} "${prompt}"`;

      // TODO(ian): Caching
      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.debug(`Error running script ${this.scriptPath}: ${error.message}`);
          reject(error);
        } else {
          const output = stripText(stdout.trim());
          logger.debug(`Output from script ${this.scriptPath}: ${output}`);
          resolve({ output });
        }
      });
    }) as Promise<ProviderResponse>;
  }
}
