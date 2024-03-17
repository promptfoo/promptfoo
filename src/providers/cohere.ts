import { fetchWithCache } from '../cache';
import logger from '../logger';

import type { ApiProvider, EnvOverrides, ProviderOptions, ProviderResponse, TokenUsage } from '../types';
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
    'command-nightly',
    'command-light-nightly',
  ];

  apiKey: string;
  modelName: string;
  options: ProviderOptions & { config?: CohereChatOptions };
  config: CohereChatOptions;

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: CohereChatOptions } = {},
  ) {
    this.modelName = modelName;
    this.options = options;
    this.config = options.config || {} as CohereChatOptions;
    this.apiKey = this.config.apiKey || process.env.COHERE_API_KEY || '';

    if (!CohereChatCompletionProvider.COHERE_CHAT_MODELS.includes(this.modelName)) {
      logger.warn(`Using unknown Cohere chat model: ${this.modelName}`);
    }
  }

  get model() {
    return `cohere:${this.modelName}`;
  }

  get label() {
    return this.options.label || this.model;
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
    } catch (error) {
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
            'X-Client-Name': process.env.COHERE_CLIENT_NAME || 'promptfoo',
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
