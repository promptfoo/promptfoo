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
  constructor(modelName: string, config: LlamaCompletionOptions) {
    this.modelName = modelName;
    this.apiBaseUrl = 'http://localhost:8080';
    this.config = config;
  }

  async callApi(prompt: string, config: LlamaCompletionOptions): Promise<ProviderResponse> {
    const body = {
      prompt,
      n_predict: config.n_predict || 512,
      temperature: config.temperature,
      top_k: config.top_k,
      top_p: config.top_p,
      n_keep: config.n_keep,
      stop: config.stop,
      repeat_penalty: config.repeat_penalty,
      repeat_last_n: config.repeat_last_n,
      penalize_nl: config.penalize_nl,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
      mirostat: config.mirostat,
      mirostat_tau: config.mirostat_tau,
      mirostat_eta: config.mirostat_eta,
      seed: config.seed,
      ignore_eos: config.ignore_eos,
      logit_bias: config.logit_bias,
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
