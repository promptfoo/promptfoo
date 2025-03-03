import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiEmbeddingProvider, ProviderEmbeddingResponse } from '../types';
import type { EnvOverrides } from '../types/env';
import { REQUEST_TIMEOUT_MS } from './shared';

// Price per token in USD (divide by 1000 from the per 1000 token price)
const MODEL_PRICING = {
  'voyage-3-large': 0.00018 / 1000, // $0.18 per million tokens
  'voyage-3': 0.00006 / 1000, // $0.06 per million tokens
  'voyage-3-lite': 0.00002 / 1000, // $0.02 per million tokens
  'voyage-code-3': 0.00018 / 1000, // $0.18 per million tokens
  'voyage-finance-2': 0.00012 / 1000, // $0.12 per million tokens
  'voyage-law-2': 0.00012 / 1000, // $0.12 per million tokens
  'voyage-code-2': 0.00012 / 1000, // $0.12 per million tokens
  'voyage-multimodal-3': 0.00018 / 1000, // $0.18 per million tokens
} as const;

const KNOWN_MODELS = new Set(Object.keys(MODEL_PRICING));

// Models that support custom dimensions
const DIMENSION_CONFIGURABLE_MODELS = new Set(['voyage-3-large', 'voyage-code-3']);
const SUPPORTED_DIMENSIONS = new Set([256, 512, 1024, 2048]);

// Multimodal models
const MULTIMODAL_MODELS = new Set(['voyage-multimodal-3']);

// Multimodal input types
type MultimodalContentType = 'text' | 'image_url' | 'image_base64';

interface MultimodalContent {
  type: MultimodalContentType;
  text?: string;
  image_url?: string;
  image_base64?: string;
}

interface MultimodalInput {
  content: MultimodalContent[];
}

function calculateCost(modelName: string, tokens: number): number {
  const pricePerToken = MODEL_PRICING[modelName as keyof typeof MODEL_PRICING] || 0;
  return tokens * pricePerToken;
}

// For multimodal embeddings, we convert image pixels to token equivalents
// According to Voyage docs: every 560 pixels counts as a token
function calculateTokensFromPixels(pixels: number): number {
  return Math.ceil(pixels / 560);
}

export class VoyageEmbeddingProvider implements ApiEmbeddingProvider {
  modelName: string;
  config: Record<string, any>;
  env?: EnvOverrides;
  apiKey?: string;

  constructor(
    modelName: string = 'voyage-3-large',
    options: { config?: Record<string, any>; env?: EnvOverrides } = {},
  ) {
    const { config, env } = options;
    this.modelName = modelName;
    this.config = config || {};
    this.env = env;
    this.apiKey = config?.apiKey || env?.VOYAGE_API_KEY || getEnvString('VOYAGE_API_KEY');

    if (!KNOWN_MODELS.has(modelName)) {
      logger.warn(`Using unknown Voyage model: ${modelName}`);
    }

    // Validate output_dimension if specified
    if (config?.output_dimension) {
      if (!DIMENSION_CONFIGURABLE_MODELS.has(modelName)) {
        logger.warn(`Model ${modelName} does not support custom output dimensions`);
      } else if (!SUPPORTED_DIMENSIONS.has(config.output_dimension)) {
        logger.warn(
          `Invalid output dimension ${config.output_dimension}. Supported values are: 256, 512, 1024, 2048`,
        );
      }
    }
  }

  id(): string {
    return `voyage:${this.modelName}`;
  }

  toString(): string {
    return `[Voyage Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  async callApi(): Promise<never> {
    throw new Error('Voyage API only supports embeddings, not text generation');
  }

  async callMultimodalEmbeddingApi(inputs: MultimodalInput[]): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Voyage API key must be set for embeddings. Set the VOYAGE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    if (!MULTIMODAL_MODELS.has(this.modelName)) {
      throw new Error(
        `Model ${this.modelName} does not support multimodal embeddings. Use voyage-multimodal-3 instead.`,
      );
    }

    const body = {
      inputs,
      model: this.modelName,
      input_type: this.config.input_type || null,
      truncation: this.config.truncation !== false, // defaults to true
      ...(this.config.output_encoding ? { output_encoding: this.config.output_encoding } : {}),
    };

    let data;
    let cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        'https://api.voyageai.com/v1/multimodalembeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err: any) {
      logger.error(`API call error: ${err}`);
      if (err.status && err.statusText && err.data?.error?.message) {
        throw new Error(
          `Voyage API call failed: ${err.status} ${err.statusText} - ${err.data.error.message}`,
        );
      }
      throw err;
    }

    logger.debug(`\tVoyage multimodal embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Voyage multimodal embeddings API response');
      }

      const textTokens = data.usage?.text_tokens || 0;
      const imagePixels = data.usage?.image_pixels || 0;
      const imageTokens = calculateTokensFromPixels(imagePixels);
      const totalTokens = data.usage?.total_tokens || textTokens + imageTokens;
      const cost = cached ? 0 : calculateCost(this.modelName, totalTokens);

      return {
        embedding,
        tokenUsage: {
          total: totalTokens,
          cached: cached ? totalTokens : 0,
          prompt: textTokens + imageTokens, // Store both text and image tokens in prompt field
          completion: 0, // Embeddings don't have completion tokens
        },
        cost,
      };
    } catch (err) {
      logger.error(data.error?.message || 'Unknown error from Voyage API');
      throw err;
    }
  }

  async callEmbeddingApi(text: string | MultimodalInput[]): Promise<ProviderEmbeddingResponse> {
    // If input is an array of MultimodalInput, use multimodal embeddings
    if (Array.isArray(text)) {
      return this.callMultimodalEmbeddingApi(text);
    }

    // Regular text embedding
    if (!this.getApiKey()) {
      throw new Error(
        'Voyage API key must be set for embeddings. Set the VOYAGE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const body = {
      input: [text],
      model: this.modelName,
      input_type: this.config.input_type || 'document',
      truncation: this.config.truncation !== false, // defaults to true
      ...(this.config.output_dimension && DIMENSION_CONFIGURABLE_MODELS.has(this.modelName)
        ? { output_dimension: this.config.output_dimension }
        : {}),
      ...(this.config.output_dtype ? { output_dtype: this.config.output_dtype } : {}),
    };

    let data;
    let cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        'https://api.voyageai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err: any) {
      logger.error(`API call error: ${err}`);
      if (err.status && err.statusText && err.data?.error?.message) {
        throw new Error(
          `Voyage API call failed: ${err.status} ${err.statusText} - ${err.data.error.message}`,
        );
      }
      throw err;
    }

    logger.debug(`\tVoyage embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Voyage embeddings API response');
      }

      const totalTokens = data.usage?.total_tokens || 0;
      const cost = cached ? 0 : calculateCost(this.modelName, totalTokens);

      return {
        embedding,
        tokenUsage: {
          total: totalTokens,
          cached: cached ? totalTokens : 0,
          prompt: totalTokens, // Store tokens in prompt field for consistency
          completion: 0, // Embeddings don't have completion tokens
        },
        cost,
      };
    } catch (err) {
      logger.error(data.error?.message || 'Unknown error from Voyage API');
      throw err;
    }
  }
}

export const DefaultEmbeddingProvider = new VoyageEmbeddingProvider('voyage-3-large');
