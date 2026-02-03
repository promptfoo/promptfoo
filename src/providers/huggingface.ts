import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  ApiSimilarityProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../types/index';

const HF_INFERENCE_API_URL = 'https://router.huggingface.co/hf-inference';
const HF_CHAT_API_BASE_URL = 'https://router.huggingface.co/v1';

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
  // When true, use OpenAI-compatible chat completions format instead of HF Inference API format.
  // Auto-detected if apiEndpoint contains '/v1/chat'.
  chatCompletion?: boolean;
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

/**
 * HuggingFace Chat Completion Provider - extends OpenAI provider for HuggingFace's
 * OpenAI-compatible chat completions API at router.huggingface.co/v1/chat/completions.
 */
export class HuggingfaceChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    const config = providerOptions.config || {};

    // Determine API base URL: strip /chat/completions suffix if user provided full URL
    let apiBaseUrl = config.apiBaseUrl || config.apiEndpoint;
    if (apiBaseUrl) {
      apiBaseUrl = apiBaseUrl.replace(/\/chat\/completions\/?$/, '');
    } else {
      apiBaseUrl = HF_CHAT_API_BASE_URL;
    }

    super(modelName, {
      ...providerOptions,
      config: {
        ...config,
        apiBaseUrl,
        apiKeyEnvar: 'HF_TOKEN',
        // Map max_new_tokens to max_tokens if not already set
        ...(config.max_new_tokens !== undefined &&
          config.max_tokens === undefined && { max_tokens: config.max_new_tokens }),
      },
    });
  }

  id(): string {
    return `huggingface:chat:${this.modelName}`;
  }

  toString(): string {
    return `[HuggingFace Chat Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return HF_CHAT_API_BASE_URL;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN') || undefined
    );
  }
}

export class HuggingfaceTextGenerationProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTextGenerationOptions;
  private chatProvider?: HuggingfaceChatCompletionProvider;
  private providerOptions: { id?: string; config?: HuggingfaceTextGenerationOptions };

  constructor(
    modelName: string,
    options: { id?: string; config?: HuggingfaceTextGenerationOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
    this.providerOptions = { ...options };
  }

  id(): string {
    return `huggingface:text-generation:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Text Generation Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN');
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

  private useChatCompletionFormat(): boolean {
    // Explicit config takes precedence
    if (this.config.chatCompletion !== undefined) {
      return this.config.chatCompletion;
    }
    // Auto-detect based on endpoint URL - only match chat-specific endpoints
    if (this.config.apiEndpoint) {
      return this.config.apiEndpoint.includes('/v1/chat');
    }
    return false;
  }

  private getChatProvider(): HuggingfaceChatCompletionProvider {
    if (!this.chatProvider) {
      this.chatProvider = new HuggingfaceChatCompletionProvider(this.modelName, {
        ...this.providerOptions,
        config: this.config,
      });
    }
    return this.chatProvider;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Delegate to chat provider if using chat completion format
    if (this.useChatCompletionFormat()) {
      return this.getChatProvider().callApi(prompt, context);
    }

    // Set up tracing context for Inference API
    const spanContext: GenAISpanContext = {
      system: 'huggingface',
      operationName: 'completion',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.top_p,
      maxTokens: this.config.max_new_tokens,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor (Huggingface doesn't return token usage by default)
    const resultExtractor = (_response: ProviderResponse): GenAISpanResult => {
      return {};
    };

    return withGenAISpan(spanContext, () => this.callInferenceApi(prompt), resultExtractor);
  }

  private async callInferenceApi(prompt: string): Promise<ProviderResponse> {
    const url = this.config.apiEndpoint
      ? this.config.apiEndpoint
      : `${HF_INFERENCE_API_URL}/models/${this.modelName}`;

    const params = {
      inputs: prompt,
      parameters: {
        return_full_text: this.config.return_full_text ?? false,
        ...this.getConfig(),
      },
    };

    logger.debug(`Huggingface Inference API request: ${url}`, { params });

    interface HuggingfaceTextGenerationResponse {
      error?: string;
      generated_text?: string;
      [0]?: { generated_text?: string };
    }

    let response: FetchWithCacheResult<HuggingfaceTextGenerationResponse> | undefined;
    try {
      response = await fetchWithCache<HuggingfaceTextGenerationResponse>(
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

      logger.debug('Huggingface Inference API response', { data: response.data });

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
    return this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    const params = {
      inputs: prompt,
      parameters: {},
    };

    interface HuggingfaceTextClassificationResponse {
      error?: string;
      [0]?: Array<{ label: string; score: number }>;
    }

    let response: FetchWithCacheResult<HuggingfaceTextClassificationResponse> | undefined;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `${HF_INFERENCE_API_URL}/models/${this.modelName}`;
      response = await fetchWithCache<HuggingfaceTextClassificationResponse>(
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
    return this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN');
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

    interface HuggingfaceFeatureExtractionResponse {
      error?: string;
    }

    let response: FetchWithCacheResult<HuggingfaceFeatureExtractionResponse | number[]> | undefined;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `${HF_INFERENCE_API_URL}/models/${this.modelName}`;
      logger.debug('Huggingface API request', { url, params });
      response = await fetchWithCache<HuggingfaceFeatureExtractionResponse | number[]>(
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

      if (typeof response.data === 'object' && 'error' in response.data) {
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
    return this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN');
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

    interface HuggingfaceSentenceSimilarityResponse {
      error?: string;
      [0]?: number;
    }

    let response:
      | FetchWithCacheResult<HuggingfaceSentenceSimilarityResponse | number[]>
      | undefined;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `${HF_INFERENCE_API_URL}/models/${this.modelName}`;
      response = await fetchWithCache<HuggingfaceSentenceSimilarityResponse | number[]>(
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

      if (typeof response.data === 'object' && 'error' in response.data) {
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

  getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('HF_TOKEN') || getEnvString('HF_API_TOKEN');
  }

  async callClassificationApi(input: string): Promise<ProviderClassificationResponse> {
    const params = {
      inputs: input,
      parameters: {
        aggregation_strategy: this.config.aggregation_strategy || 'simple',
      },
      options: {
        use_cache: this.config.use_cache === undefined ? true : this.config.use_cache,
        wait_for_model: this.config.wait_for_model || false,
      },
    };

    interface HuggingfaceTokenClassificationResponse {
      error?: string;
    }

    let response:
      | FetchWithCacheResult<
          HuggingfaceTokenClassificationResponse | Array<{ entity_group: string; score: number }>
        >
      | undefined;
    try {
      const url = this.config.apiEndpoint
        ? this.config.apiEndpoint
        : `${HF_INFERENCE_API_URL}/models/${this.modelName}`;
      response = await fetchWithCache<
        HuggingfaceTokenClassificationResponse | Array<{ entity_group: string; score: number }>
      >(
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

      if (typeof response.data === 'object' && 'error' in response.data) {
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
