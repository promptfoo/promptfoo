import logger from '../logger';
import { fetchWithCache } from '../cache';

import {
  ApiProvider,
  ApiSimilarityProvider,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

interface HuggingfaceProviderOptions {
  apiKey?: string;
  apiEndpoint?: string;
}

type HuggingfaceTextGenerationOptions = HuggingfaceProviderOptions & {
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
};

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

  getApiKey(): string | undefined {
    return this.config.apiKey || process.env.HF_API_TOKEN;
  }

  getConfig() {
    return Object.keys(this.config).reduce(
      (options, key) => {
        const optionName = key as keyof HuggingfaceTextGenerationOptions;
        if (HuggingFaceTextGenerationKeys.has(optionName)) {
          options[optionName] = this.config[optionName];
        }
        return options;
      },
      {} as Partial<
        Record<keyof HuggingfaceTextGenerationOptions, number | boolean | string | undefined>
      >,
    );
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
            Accept: 'application/json',
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

type HuggingfaceTextClassificationOptions = HuggingfaceProviderOptions;

export class HuggingfaceTextClassificationProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTextClassificationOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceTextClassificationOptions } = {},
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

  getApiKey(): string | undefined {
    return this.config.apiKey || process.env.HF_API_TOKEN;
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
            ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
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

type HuggingfaceFeatureExtractionOptions = HuggingfaceProviderOptions & {
  use_cache?: boolean;
  wait_for_model?: boolean;
};

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

  getApiKey(): string | undefined {
    return this.config.apiKey || process.env.HF_API_TOKEN;
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
            ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
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

type HuggingfaceSentenceSimilarityOptions = HuggingfaceProviderOptions & {
  use_cache?: boolean;
  wait_for_model?: boolean;
};

export class HuggingfaceSentenceSimilarityProvider implements ApiSimilarityProvider {
  modelName: string;
  config: HuggingfaceSentenceSimilarityOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceSentenceSimilarityOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:sentence-similarity:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || process.env.HF_API_TOKEN;
  }

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
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `https://api-inference.huggingface.co/models/${this.modelName}`;
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

type HuggingfaceTokenClassificationOptions = HuggingfaceProviderOptions & {
  aggregation_strategy?: string;
  use_cache?: boolean;
  wait_for_model?: boolean;
};

export class HuggingfaceTokenExtractionProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTokenClassificationOptions;

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceTokenClassificationOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:token-classification:${this.modelName}`;
  }

  async callClassificationApi(input: string): Promise<ProviderClassificationResponse> {
    const params = {
      inputs: input,
      parameters: {
        aggregation_strategy: this.config.aggregation_strategy || 'simple',
      },
      options: {
        use_cache: this.config.use_cache !== undefined ? this.config.use_cache : true,
        wait_for_model: this.config.wait_for_model || false,
      },
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

      // Take the highest score of each entity group
      const classification: Record<string, number> = {};
      for (const item of response.data) {
        if (!classification[item.entity_group] || classification[item.entity_group] < item.score) {
          classification[item.entity_group] = item.score;
        }
      }
      return { classification };
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
