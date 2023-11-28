import fetch from 'node-fetch';

import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
} from '../src/providers/openai';
import { AnthropicCompletionProvider } from '../src/providers/anthropic';
import { LlamaProvider } from '../src/providers/llama';

import { clearCache, disableCache, enableCache } from '../src/cache';
import { loadApiProvider, loadApiProviders } from '../src/providers';
import {
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
} from '../src/providers/azureopenai';
import { OllamaProvider } from '../src/providers/ollama';
import { WebhookProvider } from '../src/providers/webhook';
import {
  HuggingfaceTextGenerationProvider,
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
} from '../src/providers/huggingface';

import type { ProviderOptionsMap, ProviderFunction } from '../src/types';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('node-fetch', () => jest.fn());

jest.mock('../src/esm');

describe('providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  test('OpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ text: 'Test output' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiCompletionProvider('text-davinci-003');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('OpenAiChatCompletionProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
      ok: true,
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiChatCompletionProvider('gpt-3.5-turbo');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('OpenAiChatCompletionProvider callApi with caching', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test output 2' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
      ok: true,
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiChatCompletionProvider('gpt-3.5-turbo');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output 2');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    const result2 = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt 2' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result2.output).toBe('Test output 2');
    expect(result2.tokenUsage).toEqual({ total: 10, cached: 10 });
  });

  test('OpenAiChatCompletionProvider callApi with cache disabled', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
      ok: true,
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiChatCompletionProvider('gpt-3.5-turbo');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    disableCache();

    const result2 = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result2.output).toBe('Test output');
    expect(result2.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    enableCache();
  });

  test('OpenAiChatCompletionProvider constructor with config', async () => {
    const config = {
      temperature: 3.1415926,
      max_tokens: 201,
    };
    const provider = new OpenAiChatCompletionProvider('gpt-3.5-turbo', { config });
    const prompt = 'Test prompt';
    await provider.callApi(prompt);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringMatching(`temperature\":3.1415926`),
      }),
    );
    expect(provider.config.temperature).toBe(config.temperature);
    expect(provider.config.max_tokens).toBe(config.max_tokens);
  });

  test('AzureOpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ text: 'Test output' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new AzureOpenAiCompletionProvider('text-davinci-003');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('AzureOpenAiChatCompletionProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-3.5-turbo');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('AzureOpenAiChatCompletionProvider callApi with cache disabled', async () => {
    disableCache();

    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-3.5-turbo');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    enableCache();
  });

  test('AnthropicCompletionProvider callApi', async () => {
    const provider = new AnthropicCompletionProvider('claude-1');
    provider.anthropic.completions.create = jest.fn().mockResolvedValue({
      completion: 'Test output',
    });
    const result = await provider.callApi('Test prompt');

    expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({});
  });

  test('AnthropicCompletionProvider callApi with caching', async () => {
    const provider = new AnthropicCompletionProvider('claude-1');
    provider.anthropic.completions.create = jest.fn().mockResolvedValue({
      completion: 'Test output',
    });
    const result = await provider.callApi('Test prompt');

    expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({});

    (provider.anthropic.completions.create as jest.Mock).mockClear();
    const result2 = await provider.callApi('Test prompt');

    expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
    expect(result2.output).toBe('Test output');
    expect(result2.tokenUsage).toEqual({});
  });

  test('AnthropicCompletionProvider callApi with caching disabled', async () => {
    const provider = new AnthropicCompletionProvider('claude-1');
    provider.anthropic.completions.create = jest.fn().mockResolvedValue({
      completion: 'Test output',
    });
    const result = await provider.callApi('Test prompt');

    expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({});

    (provider.anthropic.completions.create as jest.Mock).mockClear();

    disableCache();

    const result2 = await provider.callApi('Test prompt');

    expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
    expect(result2.output).toBe('Test output');
    expect(result2.tokenUsage).toEqual({});
  });

  test('LlamaProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        content: 'Test output',
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new LlamaProvider('llama.cpp');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  test('OllamaProvider callApi', async () => {
    const mockResponse = {
      text: jest.fn()
        .mockResolvedValue(`{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.898068Z","response":"Gre","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.929199Z","response":"at","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.959989Z","response":" question","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.992117Z","response":"!","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.023658Z","response":" The","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.0551Z","response":" sky","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.086103Z","response":" appears","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.117166Z","response":" blue","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:41.695299Z","done":true,"context":[1,29871,1,13,9314],"total_duration":10411943458,"load_duration":458333,"sample_count":217,"sample_duration":154566000,"prompt_eval_count":11,"prompt_eval_duration":3334582000,"eval_count":216,"eval_duration":6905134000}`),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OllamaProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Great question! The sky appears blue');
  });

  test('WebhookProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        output: 'Test output',
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new WebhookProvider('http://example.com/webhook');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  test('HuggingfaceTextGenerationProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue([{ generated_text: 'Test output' }]),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new HuggingfaceTextGenerationProvider('gpt2');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  test('HuggingfaceFeatureExtractionProvider callEmbeddingApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new HuggingfaceFeatureExtractionProvider('distilbert-base-uncased');
    const result = await provider.callEmbeddingApi('Test text');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  test('HuggingfaceTextClassificationProvider callClassificationApi', async () => {
    const mockClassification = [
      [
        {
          label: 'nothate',
          score: 0.9,
        },
        {
          label: 'hate',
          score: 0.1,
        },
      ],
    ];
    const mockResponse = {
      json: jest.fn().mockResolvedValue(mockClassification),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new HuggingfaceTextClassificationProvider('foo');
    const result = await provider.callClassificationApi('Test text');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.classification).toEqual({
      nothate: 0.9,
      hate: 0.1,
    });
  });

  test('loadApiProvider with openai:chat', async () => {
    const provider = await loadApiProvider('openai:chat');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  test('loadApiProvider with openai:completion', async () => {
    const provider = await loadApiProvider('openai:completion');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });

  test('loadApiProvider with openai:assistant', async () => {
    const provider = await loadApiProvider('openai:assistant:foobar');
    expect(provider).toBeInstanceOf(OpenAiAssistantProvider);
  });

  test('loadApiProvider with openai:chat:modelName', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  test('loadApiProvider with openai:completion:modelName', async () => {
    const provider = await loadApiProvider('openai:completion:text-davinci-003');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });

  test('loadApiProvider with OpenAI finetuned model', async () => {
    const provider = await loadApiProvider('openai:chat:ft:gpt-3.5-turbo-0613:company-name::ID:');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('openai:ft:gpt-3.5-turbo-0613:company-name::ID:');
  });

  test('loadApiProvider with azureopenai:completion:modelName', async () => {
    const provider = await loadApiProvider('azureopenai:completion:text-davinci-003');
    expect(provider).toBeInstanceOf(AzureOpenAiCompletionProvider);
  });

  test('loadApiProvider with azureopenai:chat:modelName', async () => {
    const provider = await loadApiProvider('azureopenai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(AzureOpenAiChatCompletionProvider);
  });

  test('loadApiProvider with anthropic:completion', async () => {
    const provider = await loadApiProvider('anthropic:completion');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  test('loadApiProvider with anthropic:completion:modelName', async () => {
    const provider = await loadApiProvider('anthropic:completion:claude-1');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  test('loadApiProvider with ollama:modelName', async () => {
    const provider = await loadApiProvider('ollama:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.id()).toBe('ollama:llama2:13b');
  });

  test('loadApiProvider with llama:modelName', async () => {
    const provider = await loadApiProvider('llama');
    expect(provider).toBeInstanceOf(LlamaProvider);
  });

  test('loadApiProvider with webhook', async () => {
    const provider = await loadApiProvider('webhook:http://example.com/webhook');
    expect(provider).toBeInstanceOf(WebhookProvider);
  });

  test('loadApiProvider with huggingface:text-generation', async () => {
    const provider = await loadApiProvider('huggingface:text-generation:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextGenerationProvider);
  });

  test('loadApiProvider with huggingface:feature-extraction', async () => {
    const provider = await loadApiProvider('huggingface:feature-extraction:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceFeatureExtractionProvider);
  });

  test('loadApiProvider with huggingface:text-classification', async () => {
    const provider = await loadApiProvider('huggingface:text-classification:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
  });

  test('loadApiProvider with hf:text-classification', async () => {
    const provider = await loadApiProvider('hf:text-classification:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
  });

  test('loadApiProvider with RawProviderConfig', async () => {
    const rawProviderConfig = {
      'openai:chat': {
        id: 'test',
        config: { foo: 'bar' },
      },
    };
    const provider = await loadApiProvider('openai:chat', {
      options: rawProviderConfig['openai:chat'],
    });
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  test('loadApiProviders with ProviderFunction', async () => {
    const providerFunction: ProviderFunction = async (prompt: string) => {
      return {
        output: `Output for ${prompt}`,
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      };
    };
    const providers = await loadApiProviders(providerFunction);
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('custom-function');
    const response = await providers[0].callApi('Test prompt');
    expect(response.output).toBe('Output for Test prompt');
    expect(response.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('loadApiProviders with RawProviderConfig[]', async () => {
    const rawProviderConfigs: ProviderOptionsMap[] = [
      {
        'openai:chat:abc123': {
          config: { foo: 'bar' },
        },
      },
      {
        'openai:completion:def456': {
          config: { foo: 'bar' },
        },
      },
      {
        'anthropic:completion:ghi789': {
          config: { foo: 'bar' },
        },
      },
    ];
    const providers = await loadApiProviders(rawProviderConfigs);
    expect(providers).toHaveLength(3);
    expect(providers[0]).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(providers[1]).toBeInstanceOf(OpenAiCompletionProvider);
    expect(providers[2]).toBeInstanceOf(AnthropicCompletionProvider);
  });
});
