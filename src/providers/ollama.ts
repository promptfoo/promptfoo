import axios from 'axios';
import logger from '../logger';

import type { ApiProvider, ProviderResponse } from '../types.js';

interface OllamaCompletionOptions {
  temperature?: number;
}

export class OllamaCompletionProvider implements ApiProvider {
  static OLLAMA_COMPLETION_MODELS = [
    'llama2',
    'llama2-uncensored',
    'llama2:13b',
    'orca',
    'vicuna',
    'nous-hermes',
    'wizard-vicuna',
  ];

  modelName: string;
  options: OllamaCompletionOptions;

  constructor(modelName: string, context?: OllamaCompletionOptions) {
    this.modelName = modelName;
    this.options = context || {};
  }

  id(): string {
    return `ollama:${this.modelName}`;
  }

  toString(): string {
    return `[Ollama Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, options?: OllamaCompletionOptions): Promise<ProviderResponse> {
    const params = {
      model: this.modelName,
      prompt: prompt,
      temperature: options?.temperature ?? this.options.temperature ?? 0,
    };

    logger.debug(`Calling Ollama API: ${JSON.stringify(params)}`);
    let response;
    try {
      response = await axios.post('http://localhost:11434/api/generate', params);
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
