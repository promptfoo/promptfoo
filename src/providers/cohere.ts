import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  ProviderResponse,
  TokenUsage,
  ApiEmbeddingProvider,
  ProviderEmbeddingResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { REQUEST_TIMEOUT_MS } from './shared';

interface CohereChatOptions {
  apiKey?: string;
  modelName?: string;
  chatHistory?: Array<{
    role: string;
    message: string;
    user_name?: string;
    conversation_id?: string;
  }>;
  connectors?: Array<{
    id: string;
    user_access_token?: string;
    continue_on_failure?: boolean;
    options?: object;
  }>;
  preamble_override?: string;
  prompt_truncation?: 'AUTO' | 'OFF';
  search_queries_only?: boolean;
  documents?: Array<{
    id: string;
    citation_quality?: 'accurate' | 'fast';
  }>;
  temperature?: number;
  max_tokens?: number;
  k?: number;
  p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;

  // promptfoo-provided options
  showDocuments?: boolean;
  showSearchQueries?: boolean;
}

export class CohereChatCompletionProvider implements ApiProvider {
  static COHERE_CHAT_MODELS = [
    'command',
    'command-light',
    'command-light-nightly',
    'command-nightly',
    'command-r',
    'command-r-plus',
    'command-r-v1',
  ];

  config: CohereChatOptions;

  private apiKey: string;
  private modelName: string;

  constructor(
    modelName: string,
    options: { config?: CohereChatOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.apiKey = config?.apiKey || env?.COHERE_API_KEY || getEnvString('COHERE_API_KEY') || '';
    this.modelName = modelName;
    if (!CohereChatCompletionProvider.COHERE_CHAT_MODELS.includes(this.modelName)) {
      logger.warn(`Using unknown Cohere chat model: ${this.modelName}`);
    }
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id() {
    return `cohere:${this.modelName}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return { error: 'Cohere API key is not set. Please provide a valid apiKey.' };
    }

    const defaultParams = {
      chatHistory: [],
      connectors: [],
      prompt_truncation: 'OFF',
      search_queries_only: false,
      documents: [],
      temperature: 0.3,
      k: 0,
      p: 0.75,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const params = { ...defaultParams, ...this.config };

    let body;
    try {
      const promptObj = JSON.parse(prompt);
      if (typeof promptObj === 'object' && promptObj !== null) {
        body = {
          ...params,
          ...promptObj,
          model: this.modelName,
        };
      } else {
        throw new Error('Prompt is not a JSON object');
      }
    } catch {
      body = {
        message: prompt,
        ...params,
        model: this.modelName,
      };
    }

    logger.debug(`Calling Cohere API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        'https://api.cohere.ai/v1/chat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'X-Client-Name': getEnvString('COHERE_CLIENT_NAME') || 'promptfoo',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as { data: any; cached: boolean });

      logger.debug(`Cohere chat API response: ${JSON.stringify(data)}`);

      if (data.message) {
        return { error: data.message };
      }

      const tokenUsage: TokenUsage = {
        cached: cached ? data.token_count?.total_tokens || 0 : 0,
        total: data.token_count?.total_tokens || 0,
        prompt: data.token_count?.prompt_tokens || 0,
        completion: data.token_count?.response_tokens || 0,
      };

      let output = data.text;
      if (this.config.showSearchQueries && data.search_queries) {
        output +=
          '\n\nSearch Queries:\n' +
          data.search_queries
            .map((query: { text: string; generation_id: string }) => query.text)
            .join('\n');
      }
      if (this.config.showDocuments && data.documents) {
        output +=
          '\n\nDocuments:\n' +
          data.documents
            .map((doc: { id: string; additionalProp: string }) => JSON.stringify(doc))
            .join('\n');
      }
      return {
        cached,
        output,
        tokenUsage,
      };
    } catch (error) {
      logger.error(`API call error: ${error}`);
      return { error: `API call error: ${error}` };
    }
  }
}

export class CohereEmbeddingProvider implements ApiEmbeddingProvider {
  modelName: string;
  config: any;
  env?: any;

  constructor(modelName: string, config: any = {}, env?: any) {
    this.modelName = modelName;
    this.config = config;
    this.env = env;
  }

  id() {
    return `cohere:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] || this.env?.[this.config.apiKeyEnvar as keyof any]
        : undefined) ||
      this.env?.COHERE_API_KEY ||
      getEnvString('COHERE_API_KEY')
    );
  }

  getApiUrl(): string {
    return this.config.apiBaseUrl || 'https://api.cohere.com/v1';
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Cohere API does not provide text inference.');
  }

  async callEmbeddingApi(input: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error('Cohere API key must be set for embedding');
    }

    const body = {
      model: this.modelName,
      texts: [input],
      input_type: 'classification',
      truncate: this.config.truncate || 'NONE',
    };

    let data;
    try {
      ({ data } = (await fetchWithCache(
        `${this.getApiUrl()}/embed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            'X-Client-Name': getEnvString('COHERE_CLIENT_NAME') || 'promptfoo',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${err}`);
      throw err;
    }
    logger.debug(`\tCohere embeddings API response: ${JSON.stringify(data)}`);

    const embedding = data?.embeddings?.[0];
    if (!embedding) {
      throw new Error('No embedding found in Cohere embeddings API response');
    }
    return {
      embedding,
      tokenUsage: {
        prompt: data.meta?.billed_units?.input_tokens || 0,
        total: data.meta?.billed_units?.input_tokens || 0,
      },
    };
  }
}
