import { exec } from 'child_process';

import { ApiProvider, ProviderConfig, ProviderResponse } from '../types';

export class ScriptCompletionProvider implements ApiProvider {
  constructor(private scriptPath: string, private config?: ProviderConfig) {}

  id() {
    return 'script';
  }

  async callApi(prompt: string) {
    return new Promise((resolve, reject) => {
      exec(`${this.scriptPath} "${prompt}"`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ output: stdout.trim() });
        }
      });
    }) as Promise<ProviderResponse>;
  }
}
