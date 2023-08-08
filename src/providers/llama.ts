import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, ProviderResponse } from '../types.js';

interface LlamaCompletionOptions {
  n_predict?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  n_keep?: number;
  stop?: string[];
  repeat_penalty?: number;
  repeat_last_n?: number;
  penalize_nl?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: boolean;
  mirostat_tau?: number;
  mirostat_eta?: number;
  seed?: number;
  ignore_eos?: boolean;
  logit_bias?: Record<string, number>;
}

export class LlamaProvider implements ApiProvider {
  modelName: string;
  options?: LlamaCompletionOptions;

  constructor(modelName: string, options?: LlamaCompletionOptions) {
    this.modelName = modelName;
    this.options = options;
  }

  id(): string {
    return `llama:${this.modelName}`;
  }

  toString(): string {
    return `[Llama Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, options?: LlamaCompletionOptions): Promise<ProviderResponse> {
    options = Object.assign({}, this.options, options);
    const body = {
      prompt,
      n_predict: options?.n_predict || 512,
      temperature: options?.temperature,
      top_k: options?.top_k,
      top_p: options?.top_p,
      n_keep: options?.n_keep,
      stop: options?.stop,
      repeat_penalty: options?.repeat_penalty,
      repeat_last_n: options?.repeat_last_n,
      penalize_nl: options?.penalize_nl,
      presence_penalty: options?.presence_penalty,
      frequency_penalty: options?.frequency_penalty,
      mirostat: options?.mirostat,
      mirostat_tau: options?.mirostat_tau,
      mirostat_eta: options?.mirostat_eta,
      seed: options?.seed,
      ignore_eos: options?.ignore_eos,
      logit_bias: options?.logit_bias,
    };

    let response;
    try {
      response = await fetchWithCache(
        `${process.env.LLAMA_BASE_URL || 'http://localhost:8080'}/completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      return {
        output: response.data.content,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
