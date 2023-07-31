import axios from 'axios';
import { ApiProvider, ProviderResponse } from '../types.js';

export class LlamaProvider implements ApiProvider {
  modelName: string;
  apiBaseUrl: string;
  config: any;

  constructor(modelName: string, config: any) {
    this.modelName = modelName;
    this.apiBaseUrl = 'http://localhost:8080';
    this.config = config;
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
      n_predict: this.config.n_predict || 512,
      temperature: this.config.temperature,
      top_k: this.config.top_k,
      top_p: this.config.top_p,
      n_keep: this.config.n_keep,
      stop: this.config.stop,
      repeat_penalty: this.config.repeat_penalty,
      repeat_last_n: this.config.repeat_last_n,
      penalize_nl: this.config.penalize_nl,
      presence_penalty: this.config.presence_penalty,
      frequency_penalty: this.config.frequency_penalty,
      mirostat: this.config.mirostat,
      mirostat_tau: this.config.mirostat_tau,
      mirostat_eta: this.config.mirostat_eta,
      seed: this.config.seed,
      ignore_eos: this.config.ignore_eos,
      logit_bias: this.config.logit_bias,
    };

    let response;
    try {
      response = await axios.post(`${this.apiBaseUrl}/completion`, body);
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
