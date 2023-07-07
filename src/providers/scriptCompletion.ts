import { exec } from 'child_process';

import { ApiProvider, ProviderConfig, ProviderResponse } from '../types';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export class ScriptCompletionProvider implements ApiProvider {
  constructor(private scriptPath: string, private config?: ProviderConfig) {}

  id() {
    return `script:${this.scriptPath}`;
  }

  async callApi(prompt: string) {
    return new Promise((resolve, reject) => {
      const command = this.config.basePath ? `cd ${this.config.basePath} && ${this.scriptPath} "${prompt}"` : `${this.scriptPath} "${prompt}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ output: stripText(stdout.trim()) });
        }
      });
    }) as Promise<ProviderResponse>;
  }
}
