import logger from '../logger';
import { fetchWithCache } from '../cache';

import type { ApiProvider, ProviderResponse } from '../types.js';
import { REQUEST_TIMEOUT_MS } from './shared';

interface OllamaJsonL {
  model: string;
  created_at: string;
  response?: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  sample_count?: number;
  sample_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider implements ApiProvider {
  modelName: string;

  constructor(modelName: string, options: { id?: string } = {}) {
    const { id } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
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
      response = await fetchWithCache(
        `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
        'text',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tOllama API response: ${response.data}`);

    try {
      const output = response.data
        .split('\n')
        .filter((line: string) => line.trim() !== '')
        .map((line: string) => {
          const parsed = JSON.parse(line) as OllamaJsonL;
          if (parsed.response) {
            return parsed.response;
          }
          return null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      return {
        output,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
