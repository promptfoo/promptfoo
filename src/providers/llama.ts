import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse } from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

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
  config?: LlamaCompletionOptions;

  constructor(modelName: string, options: { config?: LlamaCompletionOptions; id?: string } = {}) {
    const { config, id } = options;
    this.modelName = modelName;
    this.config = config;
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `llama:${this.modelName}`;
  }

  toString(): string {
    return `[Llama Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const body = {
      prompt,
      n_predict: this.config?.n_predict || 512,
      temperature: this.config?.temperature,
      top_k: this.config?.top_k,
      top_p: this.config?.top_p,
      n_keep: this.config?.n_keep,
      stop: this.config?.stop,
      repeat_penalty: this.config?.repeat_penalty,
      repeat_last_n: this.config?.repeat_last_n,
      penalize_nl: this.config?.penalize_nl,
      presence_penalty: this.config?.presence_penalty,
      frequency_penalty: this.config?.frequency_penalty,
      mirostat: this.config?.mirostat,
      mirostat_tau: this.config?.mirostat_tau,
      mirostat_eta: this.config?.mirostat_eta,
      seed: this.config?.seed,
      ignore_eos: this.config?.ignore_eos,
      logit_bias: this.config?.logit_bias,
    };

    const url = getEnvString('LLAMA_BASE_URL') || 'http://localhost:8080';

    logger.debug(`[llama] Calling API at ${url} with body ${JSON.stringify(body)}`);

    let response;
    try {
      response = await fetchWithCache(
        `${url}/completion`,
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

    logger.debug(`[llama] API call response: ${JSON.stringify(response)}`);

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
