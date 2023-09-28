import fetch from 'node-fetch';
import { ApiProvider, ProviderResponse } from '../types.js';

interface HuggingfaceCompletionOptions {
  top_k?: number;
  top_p?: number;
  temperature?: number;
  repetition_penalty?: number;
  max_new_tokens?: number;
  max_time?: number;
  return_full_text?: boolean;
  num_return_sequences?: number;
  do_sample?: boolean;
  use_cache?: boolean;
  wait_for_model?: boolean;
}

export class HuggingfaceProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceCompletionOptions;

  constructor(modelName: string, options: { id?: string, config?: HuggingfaceCompletionOptions } = {}) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      inputs: prompt,
      parameters: this.config,
    };

    const response = await fetch(`https://api-inference.huggingface.co/models/${this.modelName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return {
        error: `API call error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      output: data[0]?.generated_text,
    };
  }
}
