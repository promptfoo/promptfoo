import logger from '../logger';
import { fetchWithCache } from '../cache';

import {
  ApiProvider,
  EnvOverrides,
  ProviderResponse,
  TokenUsage,
} from '../types';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

interface MistralChatCompletionOptions {
  apiKey?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  safe_prompt?: boolean;
  random_seed?: number;
  fix_json?: boolean;
  cost?: number;
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
      };
    }
  }
  return {};
}

function calculateCost(
  modelName: string,
  config: MistralChatCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [
    ...MistralChatCompletionProvider.MISTRAL_CHAT_MODELS,
  ].find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
}

export class MistralChatCompletionProvider implements ApiProvider {
  modelName: string;
  config:  MistralChatCompletionOptions;
  env?: EnvOverrides;

  static MISTRAL_CHAT_MODELS = [
    ...['open-mistral-7b'].map((model) => ({
      id: model,
      cost: {
        input: 0.00025 / 1000,
        output: 0.00025 / 1000,
      },
    })),
    ...['open-mixtral-8x7b'].map((model) => ({
      id: model,
      cost: {
        input: 0.0007 / 1000,
        output: 0.0007 / 1000,
      },
    })),
    ...['mistral-small-latest'].map((model) => ({
      id: model,
      cost: {
        input: 0.002 / 1000,
        output: 0.006 / 1000,
      },
    })),
    ...['mistral-medium-latest'].map((model) => ({
      id: model,
      cost: {
        input: 0.0027 / 1000,
        output: 0.0081 / 1000,
      },
    })),
    ...['mistral-large-latest'].map((model) => ({
      id: model,
      cost: {
        input: 0.008 / 1000,
        output: 0.024 / 1000,
      },
    }))
  ];

  static MISTRAL_CHAT_MODELS_NAMES = MistralChatCompletionProvider.MISTRAL_CHAT_MODELS.map(
    (model) => model.id,
  );

  constructor(
    modelName: string,
    options: { id?: string; config?:  MistralChatCompletionOptions; env?: EnvOverrides } = {},
  ) {
    if (!MistralChatCompletionProvider.MISTRAL_CHAT_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown Mistral chat model: ${modelName}`);
    }
    const { id, config, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `mistral:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Mistra API key is not set. Set the MISTRAL_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    
    const body = {
      model: this.modelName,
      messages: messages,
      temperature: this.config?.temperature,
      top_p: this.config?.top_p || 1,
      max_tokens: this.config?.max_tokens || 1024,
      safe_prompt: this.config?.safe_prompt || false,
      random_seed: this.config?.random_seed || null,
    };

    const url = 'https://api.mistral.ai/v1/chat/completions';
    logger.debug(`Mistral API request: ${url} ${JSON.stringify(body)}`);

    let data, 
      cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getApiKey()}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`Mistral API response: ${JSON.stringify(data)}`);

    if (data.error) {
      return {
        error: `API call error: ${data.error}`,
      };
    }
    if (!data.choices[0] && !data.choices[0].message.content) {
      return {
        error: `Malformed response data: ${JSON.stringify(data)}`,
      };
    }
    let content;
    if (this.config?.fix_json){
      // Mistral is often messing up JSON responses. This fixes the output to allow for the tests to pass.
      content = data.choices[0].message.content.replace(/\\_/g, "_").replace(/\\\*/g, "*")
    } else {
      content = data.choices[0].message.content
    }
    return {
      output: content,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      cost: calculateCost(
        this.modelName,
        this.config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
    };
  }
}