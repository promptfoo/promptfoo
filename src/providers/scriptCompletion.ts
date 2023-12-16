import { execFile } from 'child_process';

import invariant from 'tiny-invariant';

import logger from '../logger';
import type { ApiProvider, ProviderOptions, ProviderResponse } from '../types';

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
    return new Promise<ProviderResponse>((resolve, reject) => {
      const scriptParts = this.scriptPath.split(' ');
      const command = scriptParts.shift();
      invariant(command, 'No command found in script path');
      const scriptArgs = scriptParts.concat([
        prompt,
        JSON.stringify(this.options || {}),
        JSON.stringify(vars || {}),
      ]);
      const options = this.options?.config.basePath ? { cwd: this.options.config.basePath } : {};

      // TODO(ian): Caching
      execFile(command, scriptArgs, options, (error, stdout, stderr) => {
        if (error) {
          logger.debug(`Error running script ${this.scriptPath}: ${error.message}`);
          reject(error);
          return;
        }
        const errorOutput = stripText(String(stderr).trim());
        if (errorOutput) {
          logger.debug(`Error output from script ${this.scriptPath}: ${errorOutput}`);
          reject(new Error(errorOutput));
          return;
        }
        const output = stripText(String(stdout).trim());
        logger.debug(`Output from script ${this.scriptPath}: ${output}`);
        resolve({ output });
      });
    });
  }
}
