import logger from '../logger';
import { fetchWithCache } from '../cache';

import {
  ApiProvider,
  ApiSimilarityProvider,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

abstract class HuggingfaceGenericProvider<TOptions> implements ApiProvider {
  modelName: string;
  options: ProviderOptions & { config?: TOptions };
  config: TOptions;

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: TOptions } = {},
  ) {
    this.modelName = modelName;
    this.options = options;
    this.config = options.config || {} as TOptions;
  }

  get model() {
    return `huggingface:text-generation:${this.modelName}`;
  }

  get label() {
    return this.options.label || this.model;
  }

  abstract callApi(prompt: string): Promise<ProviderResponse>;
}


interface HuggingfaceTextGenerationOptions {
  apiKey?: string;
  apiEndpoint?: string;
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

const HuggingFaceTextGenerationKeys = new Set<keyof HuggingfaceTextGenerationOptions>([
  'top_k',
  'top_p',
  'temperature',
  'repetition_penalty',
  'max_new_tokens',
  'max_time',
  'return_full_text',
  'num_return_sequences',
  'do_sample',
  'use_cache',
  'wait_for_model',
]);

export class HuggingfaceTextGenerationProvider extends HuggingfaceGenericProvider<HuggingfaceTextGenerationOptions> {
  toString(): string {
    return `[Huggingface Text Generation Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || process.env.HF_API_TOKEN;
  }

  getConfig() {
    return Object.keys(this.config).reduce((options, key) => {
      const optionName = key as keyof HuggingfaceTextGenerationOptions;
      if (HuggingFaceTextGenerationKeys.has(optionName)) {
        options[optionName] = this.config[optionName];
      }
      return options;
    }, {} as Partial<Record<keyof HuggingfaceTextGenerationOptions, number | boolean | string | undefined>>);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      inputs: prompt,
      parameters: {
        return_full_text: this.config.return_full_text ?? false,
        ...this.getConfig(),
      },
    };

    const url = this.config.apiEndpoint
      ? this.config.apiEndpoint
      : `https://api-inference.huggingface.co/models/${this.modelName}`;
    logger.debug(`Huggingface API request: ${url} ${JSON.stringify(params)}`);

    let response;
    try {
      response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
      );

      logger.debug(`Huggingface API response: ${JSON.stringify(response.data)}`);

      if (response.data.error) {
        return {
          error: `API call error: ${response.data.error}`,
        };
      }
      if (!response.data[0] && !response.data.generated_text) {
        return {
          error: `Malformed response data: ${response.data}`,
        };
      }

      return {
        output: response.data.generated_text || response.data[0]?.generated_text,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }
}

interface HuggingfaceTextClassificationOptions {
  apiKey?: string;
  apiEndpoint?: string;
}

export class HuggingfaceTextClassificationProvider extends HuggingfaceGenericProvider<HuggingfaceTextClassificationOptions> {
  constructor(
    modelName: string,
    options: ProviderOptions & { config?: HuggingfaceTextClassificationOptions } = {},
  ) {
    super(modelName, options);
  }

  toString(): string {
    return `[Huggingface Text Classification Provider ${this.modelName}]`;
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    const params = {
      inputs: prompt,
      parameters: {},
    };

    let response;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `https://api-inference.huggingface.co/models/${this.modelName}`;
      response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey || process.env.HF_API_TOKEN
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
      if (!response.data[0] || !Array.isArray(response.data[0])) {
        return {
          error: `Malformed response data: ${response.data}`,
        };
      }

      const scores: Record<string, number> = {};
      response.data[0].forEach((item) => {
        scores[item.label] = item.score;
      });

      return {
        classification: scores,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const ret = await this.callClassificationApi(prompt);
    return {
      error: ret.error,
      output: JSON.stringify(ret.classification),
    };
  }
}

interface HuggingfaceFeatureExtractionOptions {
  apiKey?: string;
  apiEndpoint?: string;
  use_cache?: boolean;
  wait_for_model?: boolean;
}

export class HuggingfaceFeatureExtractionProvider extends HuggingfaceGenericProvider<HuggingfaceFeatureExtractionOptions> {
  toString(): string {
    return `[Huggingface Feature Extraction Provider ${this.modelName}]`;
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Cannot use a feature extraction provider for text generation');
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    // https://huggingface.co/docs/api-inference/detailed_parameters#feature-extraction-task
    const params = {
      inputs: text,
      options: {
        use_cache: this.config.use_cache,
        wait_for_model: this.config.wait_for_model,
      },
    };

    let response;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `https://api-inference.huggingface.co/models/${this.modelName}`;
      logger.debug(`Huggingface API request: ${url} ${JSON.stringify(params)}`);
      response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey || process.env.HF_API_TOKEN
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

interface HuggingfaceSentenceSimilarityOptions {
  use_cache?: boolean;
  wait_for_model?: boolean;
}

export class HuggingfaceSentenceSimilarityProvider extends HuggingfaceGenericProvider<HuggingfaceSentenceSimilarityOptions> {
  toString(): string {
    return `[Huggingface Sentence Similarity Provider ${this.modelName}]`;
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Cannot use a sentence similarity provider for text generation');
  }

  async callSimilarityApi(expected: string, input: string): Promise<ProviderSimilarityResponse> {
    // https://huggingface.co/docs/api-inference/detailed_parameters#sentence-similarity-task
    const params = {
      inputs: {
        source_sentence: expected,
        sentences: [input],
      },
      options: {
        use_cache: this.config.use_cache,
        wait_for_model: this.config.wait_for_model,
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
        similarity: response.data[0],
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
  }
}
