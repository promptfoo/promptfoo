import fetch from 'node-fetch';
import { ApiProvider, ProviderResult } from './types';

const OPENAI_CHAT_MODELS = ['gpt-4', 'gpt-4-0314', 'gpt-4-32k', 'gpt-4-32k-0314', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'];

const OPENAI_COMPLETION_MODELS = ['text-davinci-003', 'text-davinci-002', 'text-curie-001', 'text-babbage-001', 'text-ada-001'];

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;
  apiKey: string;

  constructor(modelName: string, apiKey?: string) {
    this.modelName = modelName;

    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.');
    }
    this.apiKey = key;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResult> {
    throw new Error('Not implemented');
  }
}

export class OpenAiCompletionProvider extends OpenAiGenericProvider {
  async callApi(prompt: string): Promise<ProviderResult> {
    const body = {
      model: this.modelName,
      prompt,
      max_tokens: 1024,
      temperature: 0,
    };
    console.log('Calling OpenAI API...', body);
    const response = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as unknown as any;
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
  async callApi(prompt: string): Promise<ProviderResult> {
    let messages: {role: string; content: string}[];
    try {
      // User can specify `messages` payload as JSON, or we'll just put the
      // string prompt into a `messages` array.
      messages = JSON.parse(prompt);
    } catch (e) {
      messages = [{role: 'user', content: prompt}];
    }
    const body = {
      model: this.modelName,
      messages: messages,
      max_tokens: 1024,
      temperature: 0,
    };
    console.log('Calling OpenAI API...', body);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as unknown as any;
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

export function loadApiProvider(apiCallerPath: string): ApiProvider {
  if (apiCallerPath?.startsWith('openai:')) {
    // Load OpenAI module
    const options = apiCallerPath.split(':');
    const modelName = options.pop();
    if (!modelName) {
      throw new Error('OpenAI model name is not specified. Please specify openai:chat, openai:completion, or openai:<model name>');
    }

    if (OPENAI_CHAT_MODELS.includes(modelName)) {
      return new OpenAiChatCompletionProvider(modelName);
    } else if (OPENAI_COMPLETION_MODELS.includes(modelName)) {
      return new OpenAiCompletionProvider(modelName);
    } else {
      if (modelName === 'chat') {
        return new OpenAiChatCompletionProvider('gpt-3.5-turbo');
      } else if (modelName === 'completion') {
        return new OpenAiCompletionProvider('text-davinci-003');
      } else {
        const modelType = options.pop();
        if (modelType === 'chat') {
          return new OpenAiChatCompletionProvider(modelName);
        } else if (modelType === 'completion') {
          return new OpenAiCompletionProvider(modelName);
        } else {
          throw new Error(`Unknown OpenAI model name: ${modelName} and type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>`);
        }
      }
    }
  }

  // Load custom module
  const CustomApiProvider = require(apiCallerPath).default;
  return new CustomApiProvider();
}
