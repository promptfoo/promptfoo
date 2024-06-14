import * as fs from 'fs';
import fetch from 'node-fetch';
import child_process from 'child_process';
import Stream from 'stream';
import { AwsBedrockCompletionProvider } from '../src/providers/bedrock';
import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
} from '../src/providers/openai';
import {
  AnthropicCompletionProvider,
  AnthropicMessagesProvider,
  outputFromMessage,
} from '../src/providers/anthropic';
import { LlamaProvider } from '../src/providers/llama';

import { clearCache, disableCache, enableCache, getCache } from '../src/cache';
import { loadApiProvider, loadApiProviders } from '../src/providers';
import {
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
} from '../src/providers/azureopenai';
import { OllamaChatProvider, OllamaCompletionProvider } from '../src/providers/ollama';
import { WebhookProvider } from '../src/providers/webhook';
import {
  HuggingfaceTextGenerationProvider,
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
} from '../src/providers/huggingface';
import { ScriptCompletionProvider } from '../src/providers/scriptCompletion';
import {
  CloudflareAiChatCompletionProvider,
  CloudflareAiCompletionProvider,
  CloudflareAiEmbeddingProvider,
  type ICloudflareProviderBaseConfig,
  type ICloudflareTextGenerationResponse,
  type ICloudflareEmbeddingResponse,
  type ICloudflareProviderConfig,
} from '../src/providers/cloudflare-ai';

import type { ProviderOptionsMap, ProviderFunction } from '../src/types';
import { ToolUseBlock } from '@aws-sdk/client-bedrock-runtime';
import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs';
import Anthropic from '@anthropic-ai/sdk';
import dedent from 'dedent';

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
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/esm');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../src/database');

describe('call provider apis', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  test('OpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output 2' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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

  test('AzureOpenAiChatCompletionProvider callApi with dataSources', async () => {
    const dataSources = [
      {
        type: 'AzureCognitiveSearch',
        endpoint: 'https://search.windows.net',
        indexName: 'search-test',
        semanticConfiguration: 'default',
        queryType: 'vectorSimpleHybrid',
      },
    ];
    const mockResponse = {
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [
            { message: { role: 'system', content: 'System prompt' } },
            { message: { role: 'user', content: 'Test prompt' } },
            { message: { role: 'assistant', content: 'Test response' } },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-3.5-turbo', {
      config: { dataSources },
    });
    const result = await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Test prompt' },
      ]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test response');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('AzureOpenAiChatCompletionProvider callApi with cache disabled', async () => {
    disableCache();

    const mockResponse = {
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
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

  describe('Anthropic', () => {
    describe('outputFromMessage', () => {
      test('should handle empty content array', () => {
        const message = {
          content: [],
        } as unknown as Anthropic.Messages.Message;

        const result = outputFromMessage(message);
        expect(result).toBe('');
      });

      test('should handle text blocks', () => {
        const message = {
          content: [{ type: 'text', text: 'Hello' }],
        } as unknown as Anthropic.Messages.Message;

        const result = outputFromMessage(message);
        expect(result).toBe('Hello');
      });

      test('should return concatenated text blocks when no tool_use blocks are present', () => {
        const message = {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        } as Anthropic.Messages.Message;

        const result = outputFromMessage(message);
        expect(result).toBe('Hello\n\nWorld');
      });

      test('should handle content with tool_use blocks', () => {
        const message = {
          content: [
            {
              type: 'tool_use',
              id: 'tool1',
              name: 'get_weather',
              input: { location: 'San Francisco, CA' },
            },
            {
              type: 'tool_use',
              id: 'tool2',
              name: 'get_time',
              input: { location: 'New York, NY' },
            },
          ],
        } as Anthropic.Messages.Message;

        const result = outputFromMessage(message);
        expect(result).toBe(
          '{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\n{"type":"tool_use","id":"tool2","name":"get_time","input":{"location":"New York, NY"}}',
        );
      });

      test('should return concatenated text and tool_use blocks as JSON strings', () => {
        const message = {
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'tool_use',
              id: 'tool1',
              name: 'get_weather',
              input: { location: 'San Francisco, CA' },
            },
            { type: 'text', text: 'World' },
          ],
        } as Anthropic.Messages.Message;

        const result = outputFromMessage(message);
        expect(result).toBe(
          'Hello\n\n{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\nWorld',
        );
      });
    });

    describe('AnthropicMessagesProvider callApi', () => {
      test('ToolUse default cache behavior', async () => {
        const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
        provider.anthropic.messages.create = jest.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
            } as TextBlock,
            {
              type: 'tool_use',
              id: 'toolu_01A09q90qw90lq917835lq9',
              toolUseId: 'toolu_01A09q90qw90lq917835lq9',
              name: 'get_weather',
              input: { location: 'San Francisco, CA', unit: 'celsius' },
            } as ToolUseBlock,
          ],
        } as Anthropic.Messages.Message);

        const result = await provider.callApi('What is the forecast in San Francisco?');
        expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);

        expect(result).toMatchObject({
          cost: undefined,
          output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

        {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","toolUseId":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
          tokenUsage: {},
        });

        const resultFromCache = await provider.callApi('What is the forecast in San Francisco?');
        expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject(resultFromCache);
      });

      test('ToolUse with caching disabled', async () => {
        const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
        provider.anthropic.messages.create = jest.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
            },
            {
              type: 'tool_use',
              id: 'toolu_01A09q90qw90lq917835lq9',
              name: 'get_weather',
              input: { location: 'San Francisco, CA', unit: 'celsius' },
            },
          ],
        } as Anthropic.Messages.Message);

        disableCache();

        const result = await provider.callApi('What is the forecast in San Francisco?');
        expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);

        expect(result).toMatchObject({
          output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

        {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
          tokenUsage: {},
        });

        await provider.callApi('What is the forecast in San Francisco?');
        expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(2);
        enableCache();
      });

      test('legacy caching behavior', async () => {
        const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
        provider.anthropic.messages.create = jest.fn().mockResolvedValue({
          content: [],
        } as unknown as Anthropic.Messages.Message);
        getCache().set(
          'anthropic:{"model":"claude-3-opus-20240229","messages":[{"role":"user","content":[{"type":"text","text":"What is the forecast in San Francisco?"}]}],"max_tokens":1024,"temperature":0,"stream":false}',
          'Test output',
        );
        const result = await provider.callApi('What is the forecast in San Francisco?');
        expect(result).toMatchObject({
          output: 'Test output',
          tokenUsage: {},
        });
        expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(0);
      });
    });

    describe('AnthropicCompletionProvider callApi', () => {
      test('default behavior', async () => {
        const provider = new AnthropicCompletionProvider('claude-1');
        provider.anthropic.completions.create = jest.fn().mockResolvedValue({
          completion: 'Test output',
        });
        const result = await provider.callApi('Test prompt');

        expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
        expect(result.output).toBe('Test output');
        expect(result.tokenUsage).toEqual({});
      });

      test('with caching enabled', async () => {
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

      test('with caching disabled', async () => {
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
    });
  });

  test('LlamaProvider callApi', async () => {
    const mockResponse = {
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          content: 'Test output',
        }),
      ),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new LlamaProvider('llama.cpp');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  test('OllamaCompletionProvider callApi', async () => {
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

    const provider = new OllamaCompletionProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Great question! The sky appears blue');
  });

  test('OllamaChatProvider callApi', async () => {
    const mockResponse = {
      text: jest.fn()
        .mockResolvedValue(`{"model":"orca-mini","created_at":"2023-12-16T01:46:19.263682972Z","message":{"role":"assistant","content":" Because","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.275143974Z","message":{"role":"assistant","content":" of","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.288137727Z","message":{"role":"assistant","content":" Ray","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.301139709Z","message":{"role":"assistant","content":"leigh","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.311364699Z","message":{"role":"assistant","content":" scattering","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.324309782Z","message":{"role":"assistant","content":".","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.337165395Z","done":true,"total_duration":1486443841,"load_duration":1280794143,"prompt_eval_count":35,"prompt_eval_duration":142384000,"eval_count":6,"eval_duration":61912000}`),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe(' Because of Rayleigh scattering.');
  });

  test('WebhookProvider callApi', async () => {
    const mockResponse = {
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          output: 'Test output',
        }),
      ),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new WebhookProvider('http://example.com/webhook');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  describe.each([
    ['Array format', [{ generated_text: 'Test output' }]], // Array format
    ['Object format', { generated_text: 'Test output' }], // Object format
  ])('HuggingfaceTextGenerationProvider callApi with %s', (format, mockedData) => {
    test('returns expected output', async () => {
      const mockResponse = {
        text: jest.fn().mockResolvedValue(JSON.stringify(mockedData)),
      };
      (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('gpt2');
      const result = await provider.callApi('Test prompt');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
    });
  });

  test('HuggingfaceFeatureExtractionProvider callEmbeddingApi', async () => {
    const mockResponse = {
      text: jest.fn().mockResolvedValue(JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5])),
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
      text: jest.fn().mockResolvedValue(JSON.stringify(mockClassification)),
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

  describe('CloudflareAi', () => {
    beforeAll(() => {
      enableCache();
    });

    const fetchMock = fetch as unknown as jest.Mock;
    const cloudflareMinimumConfig: Required<
      Pick<ICloudflareProviderBaseConfig, 'accountId' | 'apiKey'>
    > = {
      accountId: 'testAccountId',
      apiKey: 'testApiKey',
    };

    const testModelName = '@cf/meta/llama-2-7b-chat-fp16';
    // Token usage is not implemented for cloudflare so this is the default that
    // is returned
    const tokenUsageDefaultResponse = {
      total: undefined,
      prompt: undefined,
      completion: undefined,
    };

    describe('CloudflareAiCompletionProvider', () => {
      test('callApi with caching enabled', async () => {
        const PROMPT = 'Test prompt for caching';
        const provider = new CloudflareAiCompletionProvider(testModelName, {
          config: cloudflareMinimumConfig,
        });

        const responsePayload: ICloudflareTextGenerationResponse = {
          success: true,
          errors: [],
          messages: [],
          result: {
            response: 'Test text output',
          },
        };
        const mockResponse = {
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse);
        const result = await provider.callApi(PROMPT);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe(responsePayload.result.response);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);

        const resultFromCache = await provider.callApi(PROMPT);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(resultFromCache.output).toBe(responsePayload.result.response);
        expect(resultFromCache.tokenUsage).toEqual(tokenUsageDefaultResponse);
      });

      test('callApi with caching disabled', async () => {
        const PROMPT = 'test prompt without caching';
        try {
          disableCache();
          const provider = new CloudflareAiCompletionProvider(testModelName, {
            config: cloudflareMinimumConfig,
          });

          const responsePayload: ICloudflareTextGenerationResponse = {
            success: true,
            errors: [],
            messages: [],
            result: {
              response: 'Test text output',
            },
          };
          const mockResponse = {
            text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
            ok: true,
          };

          fetchMock.mockResolvedValue(mockResponse);
          const result = await provider.callApi(PROMPT);

          expect(fetch).toHaveBeenCalledTimes(1);
          expect(result.output).toBe(responsePayload.result.response);
          expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);

          const resultFromCache = await provider.callApi(PROMPT);
          expect(fetch).toHaveBeenCalledTimes(2);
          expect(resultFromCache.output).toBe(responsePayload.result.response);
          expect(resultFromCache.tokenUsage).toEqual(tokenUsageDefaultResponse);
        } finally {
          enableCache();
        }
      });

      test('callApi handles cloudflare error properly', async () => {
        const PROMPT = 'Test prompt for caching';
        const provider = new CloudflareAiCompletionProvider(testModelName, {
          config: cloudflareMinimumConfig,
        });

        const responsePayload: ICloudflareTextGenerationResponse = {
          success: false,
          errors: ['Some error occurred'],
          messages: [],
        };
        const mockResponse = {
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse);
        const result = await provider.callApi(PROMPT);

        expect(result.error).toContain(JSON.stringify(responsePayload.errors));
      });

      test('Can be invoked with custom configuration', async () => {
        const cloudflareChatConfig: ICloudflareProviderConfig = {
          accountId: 'MADE_UP_ACCOUNT_ID',
          apiKey: 'MADE_UP_API_KEY',
          frequency_penalty: 10,
        };
        const rawProviderConfigs: ProviderOptionsMap[] = [
          {
            [`cloudflare-ai:completion:${testModelName}`]: {
              config: cloudflareChatConfig,
            },
          },
        ];

        const providers = await loadApiProviders(rawProviderConfigs);
        expect(providers).toHaveLength(1);
        expect(providers[0]).toBeInstanceOf(CloudflareAiCompletionProvider);

        const cfProvider = providers[0] as CloudflareAiCompletionProvider;
        expect(cfProvider.config).toEqual(cloudflareChatConfig);

        const PROMPT = 'Test prompt for custom configuration';

        const responsePayload: ICloudflareTextGenerationResponse = {
          success: true,
          errors: [],
          messages: [],
          result: {
            response: 'Test text output',
          },
        };
        const mockResponse = {
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse);
        await cfProvider.callApi(PROMPT);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls.length).toBe(1);
        const [url, { body, headers, method }] = fetchMock.mock.calls[0];
        expect(url).toContain(cloudflareChatConfig.accountId);
        expect(method).toBe('POST');
        expect(headers['Authorization']).toContain(cloudflareChatConfig.apiKey);
        const hydratedBody = JSON.parse(body);
        expect(hydratedBody.prompt).toBe(PROMPT);

        const { accountId, apiKey, ...passThroughConfig } = cloudflareChatConfig;
        const { prompt, ...bodyWithoutPrompt } = hydratedBody;
        expect(bodyWithoutPrompt).toEqual(passThroughConfig);
      });
    });

    describe('CloudflareAiChatCompletionProvider', () => {
      test('Should handle chat provider', async () => {
        const provider = new CloudflareAiChatCompletionProvider(testModelName, {
          config: cloudflareMinimumConfig,
        });

        const responsePayload: ICloudflareTextGenerationResponse = {
          success: true,
          errors: [],
          messages: [],
          result: {
            response: 'Test text output',
          },
        };
        const mockResponse = {
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse);
        const result = await provider.callApi('Test chat prompt');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe(responsePayload.result.response);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
      });
    });

    describe('CloudflareAiEmbeddingProvider', () => {
      test('Should return embeddings in the proper format', async () => {
        const provider = new CloudflareAiEmbeddingProvider(testModelName, {
          config: cloudflareMinimumConfig,
        });

        const responsePayload: ICloudflareEmbeddingResponse = {
          success: true,
          errors: [],
          messages: [],
          result: {
            shape: [1, 3],
            data: [[0.02055364102125168, -0.013749595731496811, 0.0024201320484280586]],
          },
        };

        const mockResponse = {
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse);
        const result = await provider.callEmbeddingApi('Create embeddings from this');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.embedding).toEqual(responsePayload.result.data[0]);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
      });
    });
  });

  describe.each([
    ['python rag.py', 'python', ['rag.py']],
    ['echo "hello world"', 'echo', ['hello world']],
    ['./path/to/file.py run', './path/to/file.py', ['run']],
    ['"/Path/To/My File.py"', '/Path/To/My File.py', []],
  ])('ScriptCompletionProvider callApi with script %s', (script, inputFile, inputArgs) => {
    test('returns expected output', async () => {
      const mockResponse = 'Test script output';
      const mockChildProcess = {
        stdout: new Stream.Readable(),
        stderr: new Stream.Readable(),
      } as child_process.ChildProcess;
      jest
        .spyOn(child_process, 'execFile')
        .mockImplementation(
          (
            file: string,
            args: readonly string[] | null | undefined,
            options: child_process.ExecFileOptions | null | undefined,
            callback?:
              | null
              | ((
                  error: child_process.ExecFileException | null,
                  stdout: string | Buffer,
                  stderr: string | Buffer,
                ) => void),
          ) => {
            expect(callback).toBeTruthy();
            if (callback) {
              expect(file).toContain(inputFile);
              expect(args).toEqual(
                expect.arrayContaining(
                  inputArgs.concat([
                    'Test prompt',
                    '{"config":{"some_config_val":42}}',
                    '{"vars":{"var1":"value 1","var2":"value 2 \\"with some double \\"quotes\\"\\""}}',
                  ]),
                ),
              );
              process.nextTick(() => callback(null, Buffer.from(mockResponse), Buffer.from('')));
            }
            return mockChildProcess;
          },
        );

      const provider = new ScriptCompletionProvider(script, {
        config: {
          some_config_val: 42,
        },
      });
      const result = await provider.callApi('Test prompt', {
        vars: {
          var1: 'value 1',
          var2: 'value 2 "with some double "quotes""',
        },
      });

      expect(result.output).toBe(mockResponse);
      expect(child_process.execFile).toHaveBeenCalledTimes(1);

      jest.restoreAllMocks();
    });
  });
});

describe('loadApiProvider', () => {
  test('loadApiProvider with filepath', async () => {
    const mockYamlContent = `id: 'openai:gpt-4'
config:
  key: 'value'`;
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(mockYamlContent);

    const provider = await loadApiProvider('file://path/to/mock-provider-file.yaml');
    expect(provider.id()).toBe('openai:gpt-4');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledWith('path/to/mock-provider-file.yaml', 'utf8');
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
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama2:13b');
  });

  test('loadApiProvider with ollama:completion:modelName', async () => {
    const provider = await loadApiProvider('ollama:completion:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama2:13b');
  });

  test('loadApiProvider with ollama:chat:modelName', async () => {
    const provider = await loadApiProvider('ollama:chat:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaChatProvider);
    expect(provider.id()).toBe('ollama:chat:llama2:13b');
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

  test('loadApiProvider with bedrock:completion', async () => {
    const provider = await loadApiProvider('bedrock:completion:anthropic.claude-v2:1');
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
  });

  test('loadApiProvider with openrouter', async () => {
    const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    // Intentionally openai, because it's just a wrapper around openai
    expect(provider.id()).toBe('mistralai/mistral-medium');
  });

  test('loadApiProvider with cloudflare-ai', async () => {
    const supportedModelTypes = [
      { modelType: 'chat', providerKlass: CloudflareAiChatCompletionProvider },
      { modelType: 'embedding', providerKlass: CloudflareAiEmbeddingProvider },
      { modelType: 'embeddings', providerKlass: CloudflareAiEmbeddingProvider },
      { modelType: 'completion', providerKlass: CloudflareAiCompletionProvider },
    ] as const;
    const unsupportedModelTypes = ['assistant'] as const;
    const modelName = 'mistralai/mistral-medium';

    // Without any model type should throw an error
    await expect(() => loadApiProvider(`cloudflare-ai:${modelName}`)).rejects.toThrowError(
      /Unknown Cloudflare AI model type/,
    );

    for (const unsupportedModelType of unsupportedModelTypes) {
      await expect(() =>
        loadApiProvider(`cloudflare-ai:${unsupportedModelType}:${modelName}`),
      ).rejects.toThrowError(/Unknown Cloudflare AI model type/);
    }

    for (const { modelType, providerKlass } of supportedModelTypes) {
      const cfProvider = await loadApiProvider(`cloudflare-ai:${modelType}:${modelName}`);
      const modelTypeForId: (typeof supportedModelTypes)[number]['modelType'] =
        modelType === 'embeddings' ? 'embedding' : modelType;

      expect(cfProvider.id()).toMatch(`cloudflare-ai:${modelTypeForId}:${modelName}`);
      expect(cfProvider).toBeInstanceOf(providerKlass);
    }
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

  test('loadApiProvider sets provider.delay', async () => {
    const providerOptions = {
      id: 'test-delay',
      config: {},
      delay: 500,
    };
    const provider = await loadApiProvider('echo', { options: providerOptions });
    expect(provider.delay).toBe(500);
  });
});
