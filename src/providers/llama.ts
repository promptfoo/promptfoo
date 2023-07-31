import axios from 'axios';
import { ApiProvider, ProviderResponse } from '../types.js';

export class LlamaProvider implements ApiProvider {
  modelName: string;
  apiBaseUrl: string;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.apiBaseUrl = 'http://localhost:8080';
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
      n_predict: 512,
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
