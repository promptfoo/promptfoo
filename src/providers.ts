import fetch from 'node-fetch';

import { ApiProvider, ProviderResult } from './types.js';
import logger from './logger.js';

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;
  apiKey: string;

  constructor(modelName: string, apiKey?: string) {
    this.modelName = modelName;

    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }
    this.apiKey = key;
  }

  id(): string {
    return `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResult> {
    throw new Error('Not implemented');
  }
}

export class OpenAiCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_COMPLETION_MODELS = [
    'text-davinci-003',
    'text-davinci-002',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
  ];

  constructor(modelName: string, apiKey?: string) {
    if (!OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelName)) {
      throw new Error(
        `Unknown OpenAI completion model name: ${modelName}. Use one of the following: ${OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.join(
          ', ',
        )}`,
      );
    }
    super(modelName, apiKey);
  }

  async callApi(prompt: string): Promise<ProviderResult> {
    const body = {
      model: this.modelName,
      prompt,
      max_tokens: process.env.OPENAI_MAX_TOKENS || 1024,
      temperature: process.env.OPENAI_TEMPERATURE || 0,
    };
    logger.info(`Calling OpenAI API: ${JSON.stringify(body, null, 2)}`);
    const response = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as unknown as any;
    return {
      output: data.choices[0].text,
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
  }
}

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = [
    'gpt-4',
    'gpt-4-0314',
    'gpt-4-32k',
    'gpt-4-32k-0314',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
  ];

  constructor(modelName: string, apiKey?: string) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelName)) {
      throw new Error(
        `Unknown OpenAI completion model name: ${modelName}. Use one of the following: ${OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.join(
          ', ',
        )}`,
      );
    }
    super(modelName, apiKey);
  }

  async callApi(prompt: string): Promise<ProviderResult> {
    let messages: { role: string; content: string }[];
    try {
      // User can specify `messages` payload as JSON, or we'll just put the
      // string prompt into a `messages` array.
      messages = JSON.parse(prompt);
    } catch (e) {
      messages = [{ role: 'user', content: prompt }];
    }
    const body = {
      model: this.modelName,
      messages: messages,
      max_tokens: process.env.OPENAI_MAX_TOKENS || 1024,
      temperature: process.env.OPENAI_MAX_TEMPERATURE || 0,
    };
    logger.info(`Calling OpenAI API: ${JSON.stringify(body, null, 2)}`);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as unknown as any;
    return {
      output: data.choices[0].message.content,
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
  }
}

export function loadApiProvider(providerPath: string): ApiProvider {
  if (providerPath?.startsWith('openai:')) {
    // Load OpenAI module
    const options = providerPath.split(':');
    const modelType = options[1];
    const modelName = options[2];

    if (modelType === 'chat') {
      return new OpenAiChatCompletionProvider(modelName || 'gpt-3.5-turbo');
    } else if (modelType === 'completion') {
      return new OpenAiCompletionProvider(modelName || 'text-davinci-003');
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelType)) {
      return new OpenAiChatCompletionProvider(modelType);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelType)) {
      return new OpenAiCompletionProvider(modelType);
    } else {
      throw new Error(
        `Unknown OpenAI model type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>`,
      );
    }
  }

  // Load custom module
  const CustomApiProvider = require(providerPath).default;
  return new CustomApiProvider();
}
