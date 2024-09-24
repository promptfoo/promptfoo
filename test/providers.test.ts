import child_process from 'child_process';
import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import Stream from 'stream';
import { clearCache, disableCache, enableCache } from '../src/cache';
import { importModule } from '../src/esm';
import { loadApiProvider, loadApiProviders } from '../src/providers';
import { AnthropicCompletionProvider } from '../src/providers/anthropic';
import {
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
} from '../src/providers/azureopenai';
import { AwsBedrockCompletionProvider } from '../src/providers/bedrock';
import {
  CloudflareAiChatCompletionProvider,
  CloudflareAiCompletionProvider,
  CloudflareAiEmbeddingProvider,
  type ICloudflareProviderBaseConfig,
  type ICloudflareTextGenerationResponse,
  type ICloudflareEmbeddingResponse,
  type ICloudflareProviderConfig,
} from '../src/providers/cloudflare-ai';
import {
  HuggingfaceTextGenerationProvider,
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
} from '../src/providers/huggingface';
import { LlamaProvider } from '../src/providers/llama';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../src/providers/ollama';
import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
} from '../src/providers/openai';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../src/providers/replicate';
import { ScriptCompletionProvider } from '../src/providers/scriptCompletion';
import { VertexChatProvider, VertexEmbeddingProvider } from '../src/providers/vertex';
import { VoyageEmbeddingProvider } from '../src/providers/voyage';
import { WebhookProvider } from '../src/providers/webhook';
import RedteamIterativeProvider from '../src/redteam/providers/iterative';
import RedteamImageIterativeProvider from '../src/redteam/providers/iterativeImage';
import RedteamIterativeTreeProvider from '../src/redteam/providers/iterativeTree';
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
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/esm', () => ({
  ...jest.requireActual('../src/esm'),
  importModule: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/logger');
const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: jest.fn().mockReturnValue(null),
  },
};

describe('call provider apis', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  it('OpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiCompletionProvider('text-davinci-003');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('OpenAiChatCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('OpenAiChatCompletionProvider callApi with caching', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output 2' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
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

  it('OpenAiChatCompletionProvider callApi with cache disabled', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
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

  it('OpenAiChatCompletionProvider constructor with config', async () => {
    const config = {
      temperature: 3.1415926,
      max_tokens: 201,
    };
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', { config });
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

  it('OpenAiChatCompletionProvider callApi with structured output', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: '{"name": "John", "age": 30}' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'person',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name', 'age'],
              additionalProperties: false,
            },
          },
        },
      },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Get me a person' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ name: 'John', age: 30 });
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('OpenAiChatCompletionProvider callApi handles model refusals', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { refusal: 'Content policy violation' } }],
          usage: { total_tokens: 5, prompt_tokens: 5, completion_tokens: 0 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Generate inappropriate content' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toBe('Model refused to generate a response: Content policy violation');
    expect(result.tokenUsage).toEqual({ total: 5, prompt: 5, completion: 0 });
  });

  it('OpenAiChatCompletionProvider callApi with function tool callbacks', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: 'get_weather',
                      arguments: '{"location":"New York"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
      ok: true,
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const mockWeatherFunction = jest.fn().mockResolvedValue('Sunny, 25°C');

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
        ],
        functionToolCallbacks: {
          get_weather: mockWeatherFunction,
        },
      },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: "What's the weather in New York?" }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mockWeatherFunction).toHaveBeenCalledWith('{"location":"New York"}');
    expect(result.output).toBe('Sunny, 25°C');
    expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5 });
  });

  it('AzureOpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new AzureOpenAiCompletionProvider('text-davinci-003');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('AzureOpenAiChatCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('AzureOpenAiChatCompletionProvider callApi with dataSources', async () => {
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
      ...defaultMockResponse,
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
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-4o-mini', {
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

  it('AzureOpenAiChatCompletionProvider callApi with cache disabled', async () => {
    disableCache();

    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new AzureOpenAiChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    enableCache();
  });

  it('LlamaProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          content: 'Test output',
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new LlamaProvider('llama.cpp');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  it('OllamaCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
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
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OllamaCompletionProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Great question! The sky appears blue');
  });

  it('OllamaChatProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn()
        .mockResolvedValue(`{"model":"orca-mini","created_at":"2023-12-16T01:46:19.263682972Z","message":{"role":"assistant","content":" Because","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.275143974Z","message":{"role":"assistant","content":" of","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.288137727Z","message":{"role":"assistant","content":" Ray","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.301139709Z","message":{"role":"assistant","content":"leigh","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.311364699Z","message":{"role":"assistant","content":" scattering","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.324309782Z","message":{"role":"assistant","content":".","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.337165395Z","done":true,"total_duration":1486443841,"load_duration":1280794143,"prompt_eval_count":35,"prompt_eval_duration":142384000,"eval_count":6,"eval_duration":61912000}`),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new OllamaChatProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe(' Because of Rayleigh scattering.');
  });

  it('WebhookProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          output: 'Test output',
        }),
      ),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new WebhookProvider('http://example.com/webhook');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  describe.each([
    ['Array format', [{ generated_text: 'Test output' }]], // Array format
    ['Object format', { generated_text: 'Test output' }], // Object format
  ])('HuggingfaceTextGenerationProvider callApi with %s', (format, mockedData) => {
    it('returns expected output', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockedData)),
      };
      jest.mocked(fetch).mockResolvedValue(mockResponse as never);

      const provider = new HuggingfaceTextGenerationProvider('gpt2');
      const result = await provider.callApi('Test prompt');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
    });
  });

  it('HuggingfaceFeatureExtractionProvider callEmbeddingApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5])),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

    const provider = new HuggingfaceFeatureExtractionProvider('distilbert-base-uncased');
    const result = await provider.callEmbeddingApi('Test text');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('HuggingfaceTextClassificationProvider callClassificationApi', async () => {
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
      ...defaultMockResponse,
      text: jest.fn().mockResolvedValue(JSON.stringify(mockClassification)),
    };
    jest.mocked(fetch).mockResolvedValue(mockResponse as never);

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

    const fetchMock = jest.mocked(fetch);
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
      it('callApi with caching enabled', async () => {
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
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse as never);
        const result = await provider.callApi(PROMPT);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe(responsePayload.result.response);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);

        const resultFromCache = await provider.callApi(PROMPT);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(resultFromCache.output).toBe(responsePayload.result.response);
        expect(resultFromCache.tokenUsage).toEqual(tokenUsageDefaultResponse);
      });

      it('callApi with caching disabled', async () => {
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
            ...defaultMockResponse,
            text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
            ok: true,
          };

          fetchMock.mockResolvedValue(mockResponse as never);
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

      it('callApi handles cloudflare error properly', async () => {
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
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse as never);
        const result = await provider.callApi(PROMPT);

        expect(result.error).toContain(JSON.stringify(responsePayload.errors));
      });

      it('Can be invoked with custom configuration', async () => {
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
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse as never);
        await cfProvider.callApi(PROMPT);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls).toHaveLength(1);
        const [url, options] = fetchMock.mock.calls[0] ?? [undefined, {}];
        const { body, headers, method } = options as RequestInit;
        expect(url).toContain(cloudflareChatConfig.accountId);
        expect(method).toBe('POST');
        expect(headers && 'Authorization' in headers ? headers['Authorization'] : '').toContain(
          cloudflareChatConfig.apiKey,
        );
        const hydratedBody = typeof body === 'string' ? JSON.parse(body) : body;
        expect(hydratedBody.prompt).toBe(PROMPT);

        const {
          accountId: _accountId,
          apiKey: _apiKey,
          ...passThroughConfig
        } = cloudflareChatConfig;
        const { prompt: _prompt, ...bodyWithoutPrompt } = hydratedBody;
        expect(bodyWithoutPrompt).toEqual(passThroughConfig);
      });
    });

    describe('CloudflareAiChatCompletionProvider', () => {
      it('Should handle chat provider', async () => {
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
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse as never);
        const result = await provider.callApi('Test chat prompt');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe(responsePayload.result.response);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
      });
    });

    describe('CloudflareAiEmbeddingProvider', () => {
      it('Should return embeddings in the proper format', async () => {
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
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        fetchMock.mockResolvedValue(mockResponse as never);
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
    it('returns expected output', async () => {
      const mockResponse = 'Test script output';
      const mockChildProcess = {
        stdout: new Stream.Readable(),
        stderr: new Stream.Readable(),
      } as child_process.ChildProcess;

      const execFileSpy = jest
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
            process.nextTick(
              () => callback && callback(null, Buffer.from(mockResponse), Buffer.from('')),
            );
            return mockChildProcess;
          },
        );

      const provider = new ScriptCompletionProvider(script, {
        config: {
          some_config_val: 42,
        },
      });
      const result = await provider.callApi('Test prompt', {
        prompt: {
          label: 'Test prompt',
          raw: 'Test prompt',
        },
        vars: {
          var1: 'value 1',
          var2: 'value 2 "with some double "quotes""',
        },
      });

      expect(result.output).toBe(mockResponse);
      expect(execFileSpy).toHaveBeenCalledTimes(1);
      expect(execFileSpy).toHaveBeenCalledWith(
        expect.stringContaining(inputFile),
        expect.arrayContaining(
          inputArgs.concat([
            'Test prompt',
            '{"config":{"some_config_val":42}}',
            '{"prompt":{"label":"Test prompt","raw":"Test prompt"},"vars":{"var1":"value 1","var2":"value 2 \\"with some double \\"quotes\\"\\""}}',
          ]),
        ),
        expect.any(Object),
        expect.any(Function),
      );

      jest.restoreAllMocks();
    });
  });

  describe('OpenAiChatCompletionProvider with functionToolCallbacks', () => {
    it('should call function tool and return result', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  function_call: {
                    name: 'addNumbers',
                    arguments: '{"a":5,"b":6}',
                  },
                },
              },
            ],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
        ),
        ok: true,
      };
      jest.mocked(fetch).mockResolvedValue(mockResponse as never);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            },
          ],
          functionToolCallbacks: {
            addNumbers: (parametersJsonString) => {
              const { a, b } = JSON.parse(parametersJsonString);
              return Promise.resolve(JSON.stringify(a + b));
            },
          },
        },
      });

      const result = await provider.callApi('Add 5 and 6');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('11');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });

    it('should handle multiple function tool calls', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        name: 'addNumbers',
                        arguments: '{"a":5,"b":6}',
                      },
                    },
                    {
                      function: {
                        name: 'multiplyNumbers',
                        arguments: '{"x":2,"y":3}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 15, prompt_tokens: 7, completion_tokens: 8 },
          }),
        ),
        ok: true,
      };
      jest.mocked(fetch).mockResolvedValue(mockResponse as never);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'multiplyNumbers',
                description: 'Multiply two numbers',
                parameters: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  required: ['x', 'y'],
                },
              },
            },
          ],
          functionToolCallbacks: {
            addNumbers: (parametersJsonString) => {
              const { a, b } = JSON.parse(parametersJsonString);
              return Promise.resolve(JSON.stringify(a + b));
            },
            multiplyNumbers: (parametersJsonString) => {
              const { x, y } = JSON.parse(parametersJsonString);
              return Promise.resolve(JSON.stringify(x * y));
            },
          },
        },
      });

      const result = await provider.callApi('Add 5 and 6, then multiply 2 and 3');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('11\n6');
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 7, completion: 8 });
    });

    it('should handle errors in function tool callbacks', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  function_call: {
                    name: 'errorFunction',
                    arguments: '{}',
                  },
                },
              },
            ],
            usage: { total_tokens: 5, prompt_tokens: 2, completion_tokens: 3 },
          }),
        ),
        ok: true,
      };
      jest.mocked(fetch).mockResolvedValue(mockResponse as never);

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'errorFunction',
                description: 'A function that always throws an error',
                parameters: {
                  type: 'object',
                  properties: {},
                },
              },
            },
          ],
          functionToolCallbacks: {
            errorFunction: () => {
              throw new Error('Test error');
            },
          },
        },
      });

      const result = await provider.callApi('Call the error function');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toEqual({ arguments: '{}', name: 'errorFunction' });
      expect(result.tokenUsage).toEqual({ total: 5, prompt: 2, completion: 3 });
    });
  });
});

describe('loadApiProvider', () => {
  it('loadApiProvider with yaml filepath', async () => {
    const mockYamlContent = `id: 'openai:gpt-4'
config:
  key: 'value'`;
    jest.mocked(fs.readFileSync).mockReturnValueOnce(mockYamlContent);

    const provider = await loadApiProvider('file://path/to/mock-provider-file.yaml');
    expect(provider.id()).toBe('openai:gpt-4');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\\/]to[\\\/]mock-provider-file\.yaml/),
      'utf8',
    );
  });

  it('loadApiProvider with json filepath', async () => {
    const mockJsonContent = `{
  "id": "openai:gpt-4",
  "config": {
    "key": "value"
  }
}`;
    jest.mocked(fs.readFileSync).mockReturnValueOnce(mockJsonContent);

    const provider = await loadApiProvider('file://path/to/mock-provider-file.json');
    expect(provider.id()).toBe('openai:gpt-4');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\\/]to[\\\/]mock-provider-file\.json/),
      'utf8',
    );
  });

  it('loadApiProvider with openai:chat', async () => {
    const provider = await loadApiProvider('openai:chat');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  it('loadApiProvider with openai:completion', async () => {
    const provider = await loadApiProvider('openai:completion');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });

  it('loadApiProvider with openai:assistant', async () => {
    const provider = await loadApiProvider('openai:assistant:foobar');
    expect(provider).toBeInstanceOf(OpenAiAssistantProvider);
  });

  it('loadApiProvider with openai:chat:modelName', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  it('loadApiProvider with openai:completion:modelName', async () => {
    const provider = await loadApiProvider('openai:completion:text-davinci-003');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });

  it('loadApiProvider with OpenAI finetuned model', async () => {
    const provider = await loadApiProvider('openai:chat:ft:gpt-4o-mini:company-name::ID:');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('openai:ft:gpt-4o-mini:company-name::ID:');
  });

  it('loadApiProvider with azureopenai:completion:modelName', async () => {
    const provider = await loadApiProvider('azureopenai:completion:text-davinci-003');
    expect(provider).toBeInstanceOf(AzureOpenAiCompletionProvider);
  });

  it('loadApiProvider with azureopenai:chat:modelName', async () => {
    const provider = await loadApiProvider('azureopenai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(AzureOpenAiChatCompletionProvider);
  });

  it('loadApiProvider with anthropic:completion', async () => {
    const provider = await loadApiProvider('anthropic:completion');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  it('loadApiProvider with anthropic:completion:modelName', async () => {
    const provider = await loadApiProvider('anthropic:completion:claude-1');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  it('loadApiProvider with ollama:modelName', async () => {
    const provider = await loadApiProvider('ollama:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama2:13b');
  });

  it('loadApiProvider with ollama:completion:modelName', async () => {
    const provider = await loadApiProvider('ollama:completion:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama2:13b');
  });

  it('loadApiProvider with ollama:embedding:modelName', async () => {
    const provider = await loadApiProvider('ollama:embedding:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('loadApiProvider with ollama:embeddings:modelName', async () => {
    const provider = await loadApiProvider('ollama:embeddings:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('loadApiProvider with ollama:chat:modelName', async () => {
    const provider = await loadApiProvider('ollama:chat:llama2:13b');
    expect(provider).toBeInstanceOf(OllamaChatProvider);
    expect(provider.id()).toBe('ollama:chat:llama2:13b');
  });

  it('loadApiProvider with llama:modelName', async () => {
    const provider = await loadApiProvider('llama');
    expect(provider).toBeInstanceOf(LlamaProvider);
  });

  it('loadApiProvider with webhook', async () => {
    const provider = await loadApiProvider('webhook:http://example.com/webhook');
    expect(provider).toBeInstanceOf(WebhookProvider);
  });

  it('loadApiProvider with huggingface:text-generation', async () => {
    const provider = await loadApiProvider('huggingface:text-generation:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextGenerationProvider);
  });

  it('loadApiProvider with huggingface:feature-extraction', async () => {
    const provider = await loadApiProvider('huggingface:feature-extraction:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceFeatureExtractionProvider);
  });

  it('loadApiProvider with huggingface:text-classification', async () => {
    const provider = await loadApiProvider('huggingface:text-classification:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
  });

  it('loadApiProvider with hf:text-classification', async () => {
    const provider = await loadApiProvider('hf:text-classification:foobar/baz');
    expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
  });

  it('loadApiProvider with bedrock:completion', async () => {
    const provider = await loadApiProvider('bedrock:completion:anthropic.claude-v2:1');
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
  });

  it('loadApiProvider with openrouter', async () => {
    const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    // Intentionally openai, because it's just a wrapper around openai
    expect(provider.id()).toBe('mistralai/mistral-medium');
  });

  it('loadApiProvider with voyage', async () => {
    const provider = await loadApiProvider('voyage:voyage-2');
    expect(provider).toBeInstanceOf(VoyageEmbeddingProvider);
    expect(provider.id()).toBe('voyage:voyage-2');
  });

  it('loadApiProvider with vertex:chat', async () => {
    const provider = await loadApiProvider('vertex:chat:vertex-chat-model');
    expect(provider).toBeInstanceOf(VertexChatProvider);
    expect(provider.id()).toBe('vertex:vertex-chat-model');
  });

  it('loadApiProvider with vertex:embedding', async () => {
    const provider = await loadApiProvider('vertex:embedding:vertex-embedding-model');
    expect(provider).toBeInstanceOf(VertexEmbeddingProvider);
    expect(provider.id()).toBe('vertex:vertex-embedding-model');
  });

  it('loadApiProvider with vertex:embeddings', async () => {
    const provider = await loadApiProvider('vertex:embeddings:vertex-embedding-model');
    expect(provider).toBeInstanceOf(VertexEmbeddingProvider);
    expect(provider.id()).toBe('vertex:vertex-embedding-model');
  });

  it('loadApiProvider with vertex:modelname', async () => {
    const provider = await loadApiProvider('vertex:vertex-chat-model');
    expect(provider).toBeInstanceOf(VertexChatProvider);
    expect(provider.id()).toBe('vertex:vertex-chat-model');
  });

  it('loadApiProvider with replicate:modelname', async () => {
    const provider = await loadApiProvider('replicate:meta/llama3');
    expect(provider).toBeInstanceOf(ReplicateProvider);
    expect(provider.id()).toBe('replicate:meta/llama3');
  });

  it('loadApiProvider with replicate:modelname:version', async () => {
    const provider = await loadApiProvider('replicate:meta/llama3:abc123');
    expect(provider).toBeInstanceOf(ReplicateProvider);
    expect(provider.id()).toBe('replicate:meta/llama3:abc123');
  });

  it('loadApiProvider with replicate:image', async () => {
    const provider = await loadApiProvider('replicate:image:stability-ai/sdxl');
    expect(provider).toBeInstanceOf(ReplicateImageProvider);
    expect(provider.id()).toBe('replicate:stability-ai/sdxl');
  });

  it('loadApiProvider with replicate:image:version', async () => {
    const provider = await loadApiProvider('replicate:image:stability-ai/sdxl:abc123');
    expect(provider).toBeInstanceOf(ReplicateImageProvider);
    expect(provider.id()).toBe('replicate:stability-ai/sdxl:abc123');
  });

  it('loadApiProvider with replicate:moderation', async () => {
    const provider = await loadApiProvider('replicate:moderation:foo/bar');
    expect(provider).toBeInstanceOf(ReplicateModerationProvider);
    expect(provider.id()).toBe('replicate:foo/bar');
  });

  it('loadApiProvider with replicate:moderation:version', async () => {
    const provider = await loadApiProvider('replicate:moderation:foo/bar:abc123');
    expect(provider).toBeInstanceOf(ReplicateModerationProvider);
    expect(provider.id()).toBe('replicate:foo/bar:abc123');
  });

  it('loadApiProvider with cloudflare-ai', async () => {
    const supportedModelTypes = [
      { modelType: 'chat', providerKlass: CloudflareAiChatCompletionProvider },
      { modelType: 'embedding', providerKlass: CloudflareAiEmbeddingProvider },
      { modelType: 'embeddings', providerKlass: CloudflareAiEmbeddingProvider },
      { modelType: 'completion', providerKlass: CloudflareAiCompletionProvider },
    ] as const;
    const unsupportedModelTypes = ['assistant'] as const;
    const modelName = 'mistralai/mistral-medium';

    // Without any model type should throw an error
    await expect(loadApiProvider(`cloudflare-ai:${modelName}`)).rejects.toThrow(
      /Unknown Cloudflare AI model type/,
    );

    for (const unsupportedModelType of unsupportedModelTypes) {
      await expect(
        loadApiProvider(`cloudflare-ai:${unsupportedModelType}:${modelName}`),
      ).rejects.toThrow(/Unknown Cloudflare AI model type/);
    }

    for (const { modelType, providerKlass } of supportedModelTypes) {
      const cfProvider = await loadApiProvider(`cloudflare-ai:${modelType}:${modelName}`);
      const modelTypeForId: (typeof supportedModelTypes)[number]['modelType'] =
        modelType === 'embeddings' ? 'embedding' : modelType;

      expect(cfProvider.id()).toMatch(`cloudflare-ai:${modelTypeForId}:${modelName}`);
      expect(cfProvider).toBeInstanceOf(providerKlass);
    }
  });

  it('loadApiProvider with promptfoo:redteam:iterative', async () => {
    const provider = await loadApiProvider('promptfoo:redteam:iterative', {
      options: { config: { injectVar: 'foo' } },
    });
    expect(provider).toBeInstanceOf(RedteamIterativeProvider);
    expect(provider.id()).toBe('promptfoo:redteam:iterative');
  });

  it('loadApiProvider with promptfoo:redteam:iterative:tree', async () => {
    const provider = await loadApiProvider('promptfoo:redteam:iterative:tree', {
      options: { config: { injectVar: 'foo' } },
    });
    expect(provider).toBeInstanceOf(RedteamIterativeTreeProvider);
    expect(provider.id()).toBe('promptfoo:redteam:iterative:tree');
  });

  it('loadApiProvider with promptfoo:redteam:iterative:image', async () => {
    const provider = await loadApiProvider('promptfoo:redteam:iterative:image', {
      options: {
        config: {
          injectVar: 'imageUrl',
        },
      },
    });
    expect(provider).toBeInstanceOf(RedteamImageIterativeProvider);
    expect(provider.id()).toBe('promptfoo:redteam:iterative:image');
  });

  it('loadApiProvider with RawProviderConfig', async () => {
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

  it('loadApiProviders with ProviderFunction', async () => {
    const providerFunction: ProviderFunction = async (prompt) => {
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

  it('loadApiProviders with CustomApiProvider', async () => {
    const providerPath = 'file://path/to/file.js';

    class CustomApiProvider {
      id() {
        return 'custom-api-provider';
      }

      async callApi(input: string) {
        return { output: `Processed ${input}` };
      }
    }

    jest.mocked(importModule).mockResolvedValue(CustomApiProvider);
    const providers = await loadApiProviders(providerPath);
    expect(importModule).toHaveBeenCalledWith(path.resolve('path/to/file.js'));
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('custom-api-provider');
    const response = await providers[0].callApi('Test input');
    expect(response.output).toBe('Processed Test input');
  });

  it('loadApiProviders with CustomApiProvider, absolute path', async () => {
    const providerPath = 'file:///absolute/path/to/file.js';

    class CustomApiProvider {
      id() {
        return 'custom-api-provider';
      }

      async callApi(input: string) {
        return { output: `Processed ${input}` };
      }
    }

    jest.mocked(importModule).mockResolvedValue(CustomApiProvider);
    const providers = await loadApiProviders(providerPath);
    expect(importModule).toHaveBeenCalledWith('/absolute/path/to/file.js');
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('custom-api-provider');
    const response = await providers[0].callApi('Test input');
    expect(response.output).toBe('Processed Test input');
  });

  it('loadApiProviders with RawProviderConfig[]', async () => {
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

  it('loadApiProvider sets provider.delay', async () => {
    const providerOptions = {
      id: 'test-delay',
      config: {},
      delay: 500,
    };
    const provider = await loadApiProvider('echo', { options: providerOptions });
    expect(provider.delay).toBe(500);
  });

  it('supports templating in provider URL', async () => {
    process.env.MYHOST = 'api.example.com';
    process.env.MYPORT = '8080';

    const provider = await loadApiProvider('https://{{ env.MYHOST }}:{{ env.MYPORT }}/query', {
      options: {
        config: {
          body: {},
        },
      },
    });
    expect(provider.id()).toBe('https://api.example.com:8080/query');
    delete process.env.MYHOST;
    delete process.env.MYPORT;
  });
});
