import logger from '../logger';
import { fetchJsonWithCache } from '../cache';

import type { ApiProvider, ProviderResponse } from '../types.js';
import {REQUEST_TIMEOUT_MS} from './shared';

export class OllamaProvider implements ApiProvider {
  modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  id(): string {
    return `ollama:${this.modelName}`;
  }

  toString(): string {
    return `[Ollama Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      model: this.modelName,
      prompt,
    };

    logger.debug(`Calling Ollama API: ${JSON.stringify(params)}`);
    let response;
    try {
      response = await fetchJsonWithCache('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      }, REQUEST_TIMEOUT_MS);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tOllama API response: ${JSON.stringify(response.data)}`);
    try {
      return {
        output: response.data.completion,
        tokenUsage: {}, // TODO: add token usage once Ollama API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
