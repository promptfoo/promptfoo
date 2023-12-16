import { execFile } from 'child_process';

import invariant from 'tiny-invariant';

import logger from '../logger';
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
  constructor(private scriptPath: string, private options?: ProviderOptions) {}

  id() {
    return `exec:${this.scriptPath}`;
  }

  async callApi(prompt: string, context?: CallApiContextParams) {
    return new Promise<ProviderResponse>((resolve, reject) => {
      // This regex handles quoted arguments, which are passed to the execFile call as a single argument
      const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      let match;
      const scriptParts = [];

      // Collect all parts based on the regular expression
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
      const scriptArgs = scriptParts.concat([
        prompt,
        JSON.stringify(this.options || {}),
        JSON.stringify(context || {}),
      ]);
      const options = this.options?.config.basePath ? { cwd: this.options.config.basePath } : {};

      // TODO(ian): Caching
      execFile(command, scriptArgs, options, (error, stdout, stderr) => {
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
        resolve({ output: standardOutput });
      });
    });
  }
}
