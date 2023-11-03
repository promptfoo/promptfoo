import fetch from 'node-fetch';
import { fetchWithCache } from '../cache';

import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

interface HuggingfaceTextGenerationOptions {
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

export class HuggingfaceTextGenerationProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTextGenerationOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceTextGenerationOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:text-generation:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Text Generation Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      inputs: prompt,
      parameters: {
        return_full_text: this.config.return_full_text ?? false,
        ...this.config,
      },
    };

    let response;
    try {
      response = await fetchWithCache(
        `https://api-inference.huggingface.co/models/${this.modelName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.HF_API_TOKEN
              ? { Authorization: `Bearer ${process.env.HF_API_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (response.data.error) {
        return {
          error: `API call error: ${response.data.error}`,
        };
      }
      if (!response.data[0]) {
        return {
          error: `Malformed response data: ${response.data}`,
        };
      }

      return {
        output: response.data[0]?.generated_text,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }
}

interface HuggingfaceFeatureExtractionOptions {
  use_cache?: boolean;
  wait_for_model?: boolean;
}
export class HuggingfaceTextClassificationProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTextGenerationOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceTextGenerationOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:text-classification:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Text Classification Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      inputs: prompt,
      parameters: {
        return_full_text: this.config.return_full_text ?? false,
        ...this.config,
      },
    };

    let response;
    try {
      response = await fetchWithCache(
        `https://api-inference.huggingface.co/models/${this.modelName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.HF_API_TOKEN
              ? { Authorization: `Bearer ${process.env.HF_API_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (response.data.error) {
        return {
          error: `API call error: ${response.data.error}`,
        };
      }
      if (!Array.isArray(response.data)) {
        return {
          error: `Malformed response data: ${response.data}`,
        };
      }

      return {
        output: response.data[0],
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }
}

export class HuggingfaceFeatureExtractionProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceFeatureExtractionOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceFeatureExtractionOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:feature-extraction:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Feature Extraction Provider ${this.modelName}]`;
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Cannot use a feature extraction provider for text generation');
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const params = {
      inputs: text,
    };

    let response;
    try {
      response = await fetchWithCache(
        `https://api-inference.huggingface.co/models/${this.modelName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.HF_API_TOKEN
              ? { Authorization: `Bearer ${process.env.HF_API_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (response.data.error) {
        return {
          error: `API call error: ${response.data.error}`,
        };
      }
      if (!Array.isArray(response.data)) {
        return {
          error: `Malformed response data: ${response.data}`,
        };
      }

      return {
        embedding: response.data,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }
}
