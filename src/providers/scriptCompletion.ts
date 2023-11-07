import logger from '../logger';
import { exec } from 'child_process';

import { ApiProvider, ProviderOptions, ProviderResponse } from '../types';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export class ScriptCompletionProvider implements ApiProvider {
  constructor(private scriptPath: string, private options?: ProviderOptions) {}

  id() {
    return `exec:${this.scriptPath}`;
  }

  async callApi(prompt: string, vars?: Record<string, string | object>) {
    return new Promise((resolve, reject) => {
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const escapedOptions = JSON.stringify(this.options || {})
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      const escapedTestContext = JSON.stringify(vars || {})
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      const command = this.options?.config.basePath
        ? `cd ${this.options.config.basePath} && ${this.scriptPath} "${escapedPrompt}" "${escapedOptions}" "${escapedTestContext}"`
        : `${this.scriptPath} "${escapedPrompt}" "${escapedOptions}" "${escapedTestContext}"`;

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
