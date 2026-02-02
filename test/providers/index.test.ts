import child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Stream from 'stream';

import chalk from 'chalk';
import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import { AnthropicCompletionProvider } from '../../src/providers/anthropic/completion';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureCompletionProvider } from '../../src/providers/azure/completion';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock/index';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
} from '../../src/providers/huggingface';
import {
  getProviderIds,
  loadApiProvider,
  loadApiProviders,
  resolveProviderConfigs,
} from '../../src/providers/index';
import { LlamaProvider } from '../../src/providers/llama';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import { OpenAiAssistantProvider } from '../../src/providers/openai/assistant';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';
import { ScriptCompletionProvider } from '../../src/providers/scriptCompletion';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';
import { WebhookProvider } from '../../src/providers/webhook';
import RedteamGoatProvider from '../../src/redteam/providers/goat';
import RedteamIterativeProvider from '../../src/redteam/providers/iterative';
import RedteamImageIterativeProvider from '../../src/redteam/providers/iterativeImage';
import RedteamIterativeTreeProvider from '../../src/redteam/providers/iterativeTree';

import type { ProviderFunction, ProviderOptionsMap } from '../../src/types/index';

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

const mockExecFile = vi.hoisted(() => vi.fn());
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    default: {
      ...actual,
      execFile: mockExecFile,
    },
    execFile: mockExecFile,
  };
});

vi.mock('../../src/esm', async () => ({
  ...(await vi.importActual('../../src/esm')),
  importModule: vi.fn(),
}));

const mockFsReadFileSync = vi.hoisted(() => vi.fn());
const mockFsExistsSync = vi.hoisted(() => vi.fn());
const mockFsMkdirSync = vi.hoisted(() => vi.fn());
const mockFsWriteFileSync = vi.hoisted(() => vi.fn());
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockFsReadFileSync,
      existsSync: mockFsExistsSync,
      mkdirSync: mockFsMkdirSync,
      writeFileSync: mockFsWriteFileSync,
    },
    readFileSync: mockFsReadFileSync,
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    writeFileSync: mockFsWriteFileSync,
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn(),

    hasMagic: (path: string) => {
      // Match the real hasMagic behavior: only detect patterns in forward-slash paths
      // This mimics glob's actual behavior where backslash paths return false
      return /[*?[\]{}]/.test(path) && !path.includes('\\');
    },
  };
});

vi.mock('../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDb: vi.fn(),
  };
});

vi.mock('../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
  };
});
vi.mock('../../src/providers/websocket');

vi.mock('../../src/globalConfig/cloud', () => {
  return {
    CLOUD_API_HOST: 'https://api.promptfoo.app',
    API_HOST: 'https://api.promptfoo.app',
    CloudConfig: vi.fn(),
    cloudConfig: {
      isEnabled: vi.fn().mockReturnValue(false),
      getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.dev'),
      getApiKey: vi.fn().mockReturnValue('test-api-key'),
    },
  };
});

vi.mock('../../src/util/cloud', async () => ({
  ...(await vi.importActual('../../src/util/cloud')),
  getProviderFromCloud: vi.fn(),
  validateLinkedTargetId: vi.fn(),
}));

const mockFetch = vi.mocked(vi.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: vi.fn().mockReturnValue(null),
    entries: vi.fn().mockReturnValue([]),
  },
};

describe('call provider apis', () => {
  beforeEach(() => {
    // Set Azure environment variables for Azure provider tests
    process.env.AZURE_API_HOST = 'test.openai.azure.com';
    process.env.AZURE_API_KEY = 'test-api-key';
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    delete process.env.AZURE_API_HOST;
    delete process.env.AZURE_API_KEY;
  });

  it('AzureOpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new AzureCompletionProvider('text-davinci-003');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('AzureOpenAiChatCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new AzureChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
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
      text: vi.fn().mockResolvedValue(
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
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new AzureChatCompletionProvider('gpt-4o-mini', {
      config: { dataSources },
    });
    const result = await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Test prompt' },
      ]),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test response');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  it('AzureOpenAiChatCompletionProvider callApi with cache disabled', async () => {
    disableCache();

    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      ),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new AzureChatCompletionProvider('gpt-4o-mini');
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Test prompt' }]),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

    enableCache();
  });

  it('LlamaProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          content: 'Test output',
        }),
      ),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new LlamaProvider('llama.cpp');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  it('OllamaCompletionProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi
        .fn()
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
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Great question! The sky appears blue');
  });

  it('OllamaChatProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi
        .fn()
        .mockResolvedValue(`{"model":"orca-mini","created_at":"2023-12-16T01:46:19.263682972Z","message":{"role":"assistant","content":" Because","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.275143974Z","message":{"role":"assistant","content":" of","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.288137727Z","message":{"role":"assistant","content":" Ray","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.301139709Z","message":{"role":"assistant","content":"leigh","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.311364699Z","message":{"role":"assistant","content":" scattering","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.324309782Z","message":{"role":"assistant","content":".","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.337165395Z","done":true,"total_duration":1486443841,"load_duration":1280794143,"prompt_eval_count":35,"prompt_eval_duration":142384000,"eval_count":6,"eval_duration":61912000}`),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe(' Because of Rayleigh scattering.');
  });

  it('WebhookProvider callApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          output: 'Test output',
        }),
      ),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new WebhookProvider('http://example.com/webhook');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });

  describe.each([
    ['Array format', [{ generated_text: 'Test output' }]], // Array format
    ['Object format', { generated_text: 'Test output' }], // Object format
  ])('HuggingfaceTextGenerationProvider callApi with %s', (_format, mockedData) => {
    it('returns expected output', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockedData)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('gpt2');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
    });
  });

  describe('HuggingfaceTextGenerationProvider chat completion format', () => {
    it('auto-detects chat completion format from URL', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            choices: [{ message: { content: 'Chat response' } }],
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('deepseek-ai/DeepSeek-R1', {
        config: {
          apiEndpoint: 'https://router.huggingface.co/v1/chat/completions',
          apiKey: 'test-key',
        },
      });
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('model', 'deepseek-ai/DeepSeek-R1');
      expect(body).toHaveProperty('messages');
      expect(body.messages[0]).toEqual({ role: 'user', content: 'Test prompt' });
      expect(result.output).toBe('Chat response');
    });

    it('uses explicit chatCompletion config', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            choices: [{ message: { content: 'Chat response' } }],
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('my-model', {
        config: {
          apiEndpoint: 'https://my-custom-endpoint.com/api',
          chatCompletion: true,
        },
      });
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('messages');
      expect(result.output).toBe('Chat response');
    });

    it('maps HuggingFace parameters to OpenAI format', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            choices: [{ message: { content: 'Response' } }],
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('model', {
        config: {
          apiEndpoint: 'https://api.example.com/v1/chat/completions',
          temperature: 0.7,
          top_p: 0.9,
          max_new_tokens: 100,
        },
      });
      await provider.callApi('Test');

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.9);
      expect(body.max_tokens).toBe(100);
    });

    it('handles chat completion error response', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: { message: 'Model not found' },
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('model', {
        config: {
          apiEndpoint: 'https://api.example.com/v1/chat/completions',
        },
      });
      const result = await provider.callApi('Test');

      expect(result.error).toContain('Model not found');
    });

    it('falls back to Inference API format when chatCompletion is false', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify({ generated_text: 'Output' })),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextGenerationProvider('model', {
        config: {
          apiEndpoint: 'https://api.example.com/v1/chat/completions',
          chatCompletion: false, // Explicitly disable
        },
      });
      await provider.callApi('Test');

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('inputs');
      expect(body).toHaveProperty('parameters');
      expect(body).not.toHaveProperty('messages');
    });
  });

  it('HuggingfaceFeatureExtractionProvider callEmbeddingApi', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5])),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new HuggingfaceFeatureExtractionProvider('distilbert-base-uncased');
    const result = await provider.callEmbeddingApi('Test text');

    expect(mockFetch).toHaveBeenCalledTimes(1);
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
      text: vi.fn().mockResolvedValue(JSON.stringify(mockClassification)),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new HuggingfaceTextClassificationProvider('foo');
    const result = await provider.callClassificationApi('Test text');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.classification).toEqual({
      nothate: 0.9,
      hate: 0.1,
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

      mockExecFile.mockImplementation(((_file: any, _args: any, _options: any, callback: any) => {
        process.nextTick(
          () => callback && callback(null, Buffer.from(mockResponse), Buffer.from('')),
        );
        return mockChildProcess;
      }) as any);

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
      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile).toHaveBeenCalledWith(
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

      vi.restoreAllMocks();
    });
  });
});

describe('loadApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadApiProvider with yaml filepath', async () => {
    const mockYamlContent = dedent`
    id: 'openai:gpt-5.1-mini'
    config:
      key: 'value'`;
    const mockReadFileSync = vi.mocked(fs.readFileSync);
    mockReadFileSync.mockReturnValue(mockYamlContent);

    const provider = await loadApiProvider('file://path/to/mock-provider-file.yaml');
    expect(provider.id()).toBe('openai:gpt-5.1-mini');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\/]to[\\/]mock-provider-file\.yaml/),
      'utf8',
    );
  });

  it('loadApiProvider with json filepath', async () => {
    const mockJsonContent = `{
  "id": "openai:gpt-5.1-mini",
  "config": {
    "key": "value"
  }
}`;
    vi.mocked(fs.readFileSync).mockImplementationOnce(function () {
      return mockJsonContent;
    });

    const provider = await loadApiProvider('file://path/to/mock-provider-file.json');
    expect(provider.id()).toBe('openai:gpt-5.1-mini');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\/]to[\\/]mock-provider-file\.json/),
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
    expect(provider).toBeInstanceOf(AzureCompletionProvider);
  });

  it('loadApiProvider with azureopenai:chat:modelName', async () => {
    const provider = await loadApiProvider('azureopenai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(AzureChatCompletionProvider);
  });

  it('loadApiProvider with anthropic:completion', async () => {
    const provider = await loadApiProvider('anthropic:completion');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  it('loadApiProvider with anthropic:completion:modelName', async () => {
    const provider = await loadApiProvider('anthropic:completion:claude-1');
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  it('should load Ollama completion provider', async () => {
    const provider = await loadApiProvider('ollama:llama3.3:8b');
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama3.3:8b');
  });

  it('should load Ollama completion provider with explicit type', async () => {
    const provider = await loadApiProvider('ollama:completion:llama3.3:8b');
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.id()).toBe('ollama:completion:llama3.3:8b');
  });

  it('should load Ollama embedding provider', async () => {
    const provider = await loadApiProvider('ollama:embedding:llama3.3:8b');
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('should load Ollama embeddings provider (alias)', async () => {
    const provider = await loadApiProvider('ollama:embeddings:llama3.3:8b');
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('should load Ollama chat provider', async () => {
    const provider = await loadApiProvider('ollama:chat:llama3.3:8b');
    expect(provider).toBeInstanceOf(OllamaChatProvider);
    expect(provider.id()).toBe('ollama:chat:llama3.3:8b');
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
    // OpenRouter provider now returns id with prefix
    expect(provider.id()).toBe('openrouter:mistralai/mistral-medium');
  });

  it('loadApiProvider with github', async () => {
    const provider = await loadApiProvider('github:gpt-4o-mini');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    // Intentionally openai, because it's just a wrapper around openai
    expect(provider.id()).toBe('gpt-4o-mini');
  });

  it('loadApiProvider with perplexity', async () => {
    const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('llama-3-sonar-large-32k-online');
    expect(provider.config.apiBaseUrl).toBe('https://api.perplexity.ai');
    expect(provider.config.apiKeyEnvar).toBe('PERPLEXITY_API_KEY');
  });

  it('loadApiProvider with togetherai', async () => {
    const provider = await loadApiProvider(
      'togetherai:chat:meta/meta-llama/Meta-Llama-3-8B-Instruct',
    );
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('meta/meta-llama/Meta-Llama-3-8B-Instruct');
  });

  it('loadApiProvider with litellm default (chat)', async () => {
    const provider = await loadApiProvider('litellm:gpt-5.1-mini');
    expect(provider.id()).toBe('litellm:gpt-5.1-mini');
    expect(provider.toString()).toBe('[LiteLLM Provider gpt-5.1-mini]');
    expect(provider.config.apiBaseUrl).toBe('http://0.0.0.0:4000');
    expect(provider.config.apiKeyEnvar).toBe('LITELLM_API_KEY');
  });

  it('loadApiProvider with litellm:chat', async () => {
    const provider = await loadApiProvider('litellm:chat:gpt-5.1-mini');
    expect(provider.id()).toBe('litellm:gpt-5.1-mini');
    expect(provider.toString()).toBe('[LiteLLM Provider gpt-5.1-mini]');
  });

  it('loadApiProvider with litellm:completion', async () => {
    const provider = await loadApiProvider('litellm:completion:gpt-3.5-turbo-instruct');
    expect(provider.id()).toBe('litellm:completion:gpt-3.5-turbo-instruct');
    expect(provider.toString()).toBe('[LiteLLM Provider completion gpt-3.5-turbo-instruct]');
  });

  it('loadApiProvider with litellm:embedding', async () => {
    const provider = await loadApiProvider('litellm:embedding:text-embedding-3-small');
    expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
    expect(provider.toString()).toBe('[LiteLLM Provider embedding text-embedding-3-small]');
    expect('callEmbeddingApi' in provider).toBe(true);
  });

  it('loadApiProvider with litellm:embeddings (alias)', async () => {
    const provider = await loadApiProvider('litellm:embeddings:text-embedding-3-small');
    expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
    expect(provider.toString()).toBe('[LiteLLM Provider embedding text-embedding-3-small]');
    expect('callEmbeddingApi' in provider).toBe(true);
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

  it('loadApiProvider with file://*.py', async () => {
    const provider = await loadApiProvider('file://script.py:function_name');
    expect(provider).toBeInstanceOf(PythonProvider);
    expect(provider.id()).toBe('python:script.py:function_name');
  });

  it('loadApiProvider with python:*.py', async () => {
    const provider = await loadApiProvider('python:script.py');
    expect(provider).toBeInstanceOf(PythonProvider);
    expect(provider.id()).toBe('python:script.py:default');
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

  it('loadApiProvider with promptfoo:redteam:goat', async () => {
    const provider = await loadApiProvider('promptfoo:redteam:goat', {
      options: { config: { injectVar: 'goal' } },
    });
    expect(provider).toBeInstanceOf(RedteamGoatProvider);
    expect(provider.id()).toBe('promptfoo:redteam:goat');
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

    vi.mocked(importModule).mockResolvedValue(CustomApiProvider);
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

    vi.mocked(importModule).mockResolvedValue(CustomApiProvider);
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
    process.env.MY_HOST = 'api.example.com';
    process.env.MY_PORT = '8080';

    const provider = await loadApiProvider('https://{{ env.MY_HOST }}:{{ env.MY_PORT }}/query', {
      options: {
        config: {
          body: {},
        },
      },
    });
    expect(provider.id()).toBe('https://api.example.com:8080/query');
    delete process.env.MY_HOST;
    delete process.env.MY_PORT;
  });

  it('supports templating in provider URL with context env overrides', async () => {
    const provider = await loadApiProvider('https://{{ env.MY_HOST }}:{{ env.MY_PORT }}/query', {
      env: {
        MY_HOST: 'api.example.com',
        MY_PORT: '8080',
      },
      options: {
        config: {
          body: {},
        },
      },
    });

    expect(provider.id()).toBe('https://api.example.com:8080/query');
  });

  it('uses provider env overrides when rendering provider config', async () => {
    const provider = await loadApiProvider('echo', {
      options: {
        env: {
          MY_API_KEY: 'secret',
        },
        config: {
          apiKey: '{{ env.MY_API_KEY }}',
        },
      },
    });

    expect(provider.config.apiKey).toBe('secret');
  });

  it('passes provider env overrides to provider instances', async () => {
    const provider = (await loadApiProvider('openai:chat', {
      options: {
        env: {
          OPENAI_API_KEY: 'override-key',
        },
        config: {
          apiKeyRequired: false,
        },
      },
    })) as OpenAiChatCompletionProvider;

    expect(provider.env?.OPENAI_API_KEY).toBe('override-key');
  });

  it('isolates env overrides between multiple provider loads', async () => {
    // First provider with HOST=dev
    const devProvider = await loadApiProvider('https://{{ env.HOST }}/v1/api', {
      options: {
        env: {
          HOST: 'dev.example.com',
        },
        config: {
          body: {},
        },
      },
    });

    // Second provider with HOST=prod
    const prodProvider = await loadApiProvider('https://{{ env.HOST }}/v1/api', {
      options: {
        env: {
          HOST: 'prod.example.com',
        },
        config: {
          body: {},
        },
      },
    });

    // Each provider should have its own resolved URL
    expect(devProvider.id()).toBe('https://dev.example.com/v1/api');
    expect(prodProvider.id()).toBe('https://prod.example.com/v1/api');
  });

  it('options.env takes precedence over context.env for same keys', async () => {
    const provider = await loadApiProvider('https://{{ env.HOST }}:{{ env.PORT }}/query', {
      env: {
        HOST: 'context-host.com',
        PORT: '8080',
      },
      options: {
        env: {
          HOST: 'options-host.com', // Should override context.env.HOST
        },
        config: {
          body: {},
        },
      },
    });

    // HOST should come from options.env, PORT from context.env
    expect(provider.id()).toBe('https://options-host.com:8080/query');
  });

  it('renders label using env overrides', async () => {
    const provider = await loadApiProvider('echo', {
      options: {
        label: 'API ({{ env.ENVIRONMENT }})',
        env: {
          ENVIRONMENT: 'staging',
        },
      },
    });

    expect(provider.label).toBe('API (staging)');
  });

  it('loadApiProvider with yaml filepath containing multiple providers', async () => {
    const mockYamlContent = dedent`
    - id: 'openai:gpt-4o-mini'
      config:
        key: 'value1'
    - id: 'anthropic:messages:claude-3-5-sonnet-20241022'
      config:
        key: 'value2'`;
    const mockReadFileSync = vi.mocked(fs.readFileSync);
    mockReadFileSync.mockReturnValue(mockYamlContent);

    const providers = await loadApiProviders('file://path/to/mock-providers-file.yaml');
    expect(providers).toHaveLength(2);
    expect(providers[0].id()).toBe('openai:gpt-4o-mini');
    expect(providers[1].id()).toBe('anthropic:messages:claude-3-5-sonnet-20241022');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\/]to[\\/]mock-providers-file\.yaml/),
      'utf8',
    );
  });

  it('loadApiProvider with json filepath containing multiple providers', async () => {
    const mockJsonContent = JSON.stringify([
      {
        id: 'openai:gpt-4o-mini',
        config: { key: 'value1' },
      },
      {
        id: 'anthropic:messages:claude-3-5-sonnet-20241022',
        config: { key: 'value2' },
      },
    ]);
    vi.mocked(fs.readFileSync).mockImplementationOnce(function () {
      return mockJsonContent;
    });

    const providers = await loadApiProviders('file://path/to/mock-providers-file.json');
    expect(providers).toHaveLength(2);
    expect(providers[0].id()).toBe('openai:gpt-4o-mini');
    expect(providers[1].id()).toBe('anthropic:messages:claude-3-5-sonnet-20241022');
  });

  it('throws an error for unidentified providers', async () => {
    const mockError = vi.spyOn(logger, 'error');
    const unknownProviderPath = 'unknown:provider';

    await expect(loadApiProvider(unknownProviderPath)).rejects.toThrow(
      `Could not identify provider: ${chalk.bold(unknownProviderPath)}`,
    );
    expect(mockError).toHaveBeenCalledWith(
      dedent`
        Could not identify provider: ${chalk.bold(unknownProviderPath)}.

        ${chalk.white(dedent`
          Please check your configuration and ensure the provider is correctly specified.

          For more information on supported providers, visit: `)} ${chalk.cyan('https://promptfoo.dev/docs/providers/')}
      `,
    );
    mockError.mockRestore();
  });

  it('renders label using Nunjucks', async () => {
    process.env.someVariable = 'foo';
    const providerOptions = {
      id: 'openai:chat:gpt-4o',
      config: {},
      label: '{{ env.someVariable }}',
    };
    const provider = await loadApiProvider('openai:chat:gpt-4o', { options: providerOptions });
    expect(provider.label).toBe('foo');
  });

  it('renders environment variables in provider config while preserving runtime vars', async () => {
    process.env.MY_DEPLOYMENT = 'test-deployment';
    process.env.AZURE_ENDPOINT = 'test.openai.azure.com';
    process.env.API_VERSION = '2024-02-15';

    const providerOptions = {
      config: {
        apiHost: '{{ env.AZURE_ENDPOINT }}',
        apiVersion: '{{ env.API_VERSION }}',
        // This should be preserved for runtime
        body: { message: '{{ vars.userMessage }}' },
      },
    };

    const provider = await loadApiProvider('azure:chat:{{ env.MY_DEPLOYMENT }}', {
      options: providerOptions,
    });

    expect(provider).toBeInstanceOf(AzureChatCompletionProvider);
    // Env vars should be rendered
    expect((provider as AzureChatCompletionProvider).apiHost).toBe('test.openai.azure.com');
    expect((provider as AzureChatCompletionProvider).config.apiVersion).toBe('2024-02-15');
    // Vars templates should be preserved
    expect((provider as any).config.body).toEqual({
      message: '{{ vars.userMessage }}',
    });

    delete process.env.MY_DEPLOYMENT;
    delete process.env.AZURE_ENDPOINT;
    delete process.env.API_VERSION;
  });

  it('loadApiProvider with xai', async () => {
    const provider = await loadApiProvider('xai:grok-2');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('xai:grok-2');
    expect(provider.config.apiBaseUrl).toBe('https://api.x.ai/v1');
    expect(provider.config.apiKeyEnvar).toBe('XAI_API_KEY');
  });

  it.each([
    ['dashscope:chat:qwen-max', 'qwen-max'],
    ['dashscope:vl:qwen-vl-max', 'qwen-vl-max'],
    ['alibaba:qwen-plus', 'qwen-plus'],
    ['alibaba:chat:qwen-max', 'qwen-max'],
    ['alibaba:vl:qwen-vl-max', 'qwen-vl-max'],
    ['alicloud:qwen-plus', 'qwen-plus'],
    ['aliyun:qwen-plus', 'qwen-plus'],
  ])('loadApiProvider with %s', async (providerId, expectedModelId) => {
    const provider = await loadApiProvider(providerId);
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe(expectedModelId);
    expect(provider.config.apiBaseUrl).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    );
    expect(provider.config.apiKeyEnvar).toBe('DASHSCOPE_API_KEY');
  });

  it('loadApiProvider with alibaba embedding', async () => {
    const provider = await loadApiProvider('alibaba:embedding:text-embedding-v3');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(provider.id()).toBe('text-embedding-v3');
    expect(provider.config.apiBaseUrl).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    );
    expect(provider.config.apiKeyEnvar).toBe('DASHSCOPE_API_KEY');
  });

  it('loadApiProvider with alibaba unknown model', async () => {
    // Unknown models now only warn, they don't throw errors
    const provider = await loadApiProvider('alibaba:unknown-model');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('unknown-model');
    expect(provider.config.apiBaseUrl).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    );
    expect(provider.config.apiKeyEnvar).toBe('DASHSCOPE_API_KEY');
  });

  describe('linkedTargetId validation', () => {
    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it('should accept valid linkedTargetId', async () => {
      const { validateLinkedTargetId } = await import('../../src/util/cloud');
      vi.mocked(validateLinkedTargetId).mockResolvedValue();

      const mockYamlContent = dedent`
        id: 'openai:gpt-5.1-mini'
        config:
          linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'`;
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      mockReadFileSync.mockReturnValue(mockYamlContent);

      const provider = await loadApiProvider('file://path/to/provider.yaml');
      expect(provider.id()).toBe('openai:gpt-5.1-mini');
      expect(validateLinkedTargetId).toHaveBeenCalledWith(
        'promptfoo://provider/12345678-1234-1234-1234-123456789abc',
      );
    });

    it('should throw error when linkedTargetId validation fails', async () => {
      const { validateLinkedTargetId } = await import('../../src/util/cloud');
      vi.mocked(validateLinkedTargetId).mockRejectedValue(
        new Error(
          "Target promptfoo://provider/12345678-1234-1234-1234-123456789abc not found in cloud or you don't have access to it",
        ),
      );

      const mockYamlContent = dedent`
        id: 'openai:gpt-5.1-mini'
        config:
          linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'`;
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      mockReadFileSync.mockReturnValue(mockYamlContent);

      await expect(loadApiProvider('file://path/to/provider.yaml')).rejects.toThrow(
        "Target promptfoo://provider/12345678-1234-1234-1234-123456789abc not found in cloud or you don't have access to it",
      );
    });

    it('should accept provider config without linkedTargetId', async () => {
      const { validateLinkedTargetId } = await import('../../src/util/cloud');

      const mockYamlContent = dedent`
        id: 'openai:gpt-5.1-mini'
        config:
          temperature: 0.7`;
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      mockReadFileSync.mockReturnValue(mockYamlContent);

      const provider = await loadApiProvider('file://path/to/provider.yaml');
      expect(provider.id()).toBe('openai:gpt-5.1-mini');
      expect(validateLinkedTargetId).not.toHaveBeenCalled();
    });
  });
});

describe('getProviderIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns provider IDs from a file-based config with multiple providers', () => {
    const mockYamlContent = dedent`
    - id: 'openai:gpt-4o-mini'
      config:
        key: 'value1'
    - id: 'anthropic:messages:claude-3-5-sonnet-20241022'
      config:
        key: 'value2'`;
    const mockReadFileSync = vi.mocked(fs.readFileSync);
    mockReadFileSync.mockReturnValue(mockYamlContent);

    const providerIds = getProviderIds('file://path/to/providers.yaml');
    expect(providerIds).toEqual([
      'openai:gpt-4o-mini',
      'anthropic:messages:claude-3-5-sonnet-20241022',
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/path[\\/]to[\\/]providers\.yaml/),
      'utf8',
    );
  });

  it('returns provider ID from a file with a single provider (non-array)', () => {
    const mockYamlContent = dedent`
    id: 'openai:gpt-4o-mini'
    config:
      key: 'value1'`;
    vi.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);

    const providerIds = getProviderIds('file://path/to/single-provider.yaml');
    expect(providerIds).toEqual(['openai:gpt-4o-mini']);
  });

  it('handles .yml extension', () => {
    const mockYamlContent = dedent`
    id: 'openai:gpt-4o-mini'
    config:
      key: 'value1'`;
    vi.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);

    const providerIds = getProviderIds('file://path/to/provider.yml');
    expect(providerIds).toEqual(['openai:gpt-4o-mini']);
  });

  it('handles .json extension', () => {
    const mockJsonContent = JSON.stringify({
      id: 'openai:gpt-4o-mini',
      config: { key: 'value1' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);

    const providerIds = getProviderIds('file://path/to/provider.json');
    expect(providerIds).toEqual(['openai:gpt-4o-mini']);
  });

  it('flattens file-based providers when mixed with inline providers', () => {
    const mockYamlContent = dedent`
    - id: 'openai:gpt-4o-mini'
      config:
        key: 'value1'
    - id: 'anthropic:messages:claude-3-5-sonnet-20241022'
      config:
        key: 'value2'`;
    vi.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);

    const providerIds = getProviderIds(['echo', 'file://path/to/providers.yaml']);
    expect(providerIds).toEqual([
      'echo',
      'openai:gpt-4o-mini',
      'anthropic:messages:claude-3-5-sonnet-20241022',
    ]);
  });

  it('throws error when provider config is missing id', () => {
    const mockYamlContent = dedent`
    config:
      key: 'value1'`;
    vi.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);

    expect(() => getProviderIds('file://path/to/provider.yaml')).toThrow(
      'Provider config in path/to/provider.yaml must have an id',
    );
  });

  it('returns string provider as-is when not a file reference', () => {
    const providerIds = getProviderIds('openai:gpt-4o-mini');
    expect(providerIds).toEqual(['openai:gpt-4o-mini']);
  });

  it('returns custom-function for function provider', () => {
    const customFunction = async () => ({ output: 'test' });
    const providerIds = getProviderIds(customFunction);
    expect(providerIds).toEqual(['custom-function']);
  });

  it('handles array with function providers', () => {
    const labeledFunction = async () => ({ output: 'test' });
    labeledFunction.label = 'my-custom-provider';

    const unlabeledFunction = async () => ({ output: 'test2' });

    const providerIds = getProviderIds(['echo', labeledFunction, unlabeledFunction]);
    expect(providerIds).toEqual(['echo', 'my-custom-provider', 'custom-function-2']);
  });

  it('extracts id from ProviderOptions objects', () => {
    const providerIds = getProviderIds([
      { id: 'openai:gpt-4o-mini', config: { temperature: 0.5 } },
      { id: 'anthropic:messages:claude-3-5-sonnet-20241022' },
    ]);
    expect(providerIds).toEqual([
      'openai:gpt-4o-mini',
      'anthropic:messages:claude-3-5-sonnet-20241022',
    ]);
  });

  it('extracts id from ProviderOptionsMap objects', () => {
    const providerIds = getProviderIds([
      { 'openai:gpt-4o-mini': { config: { temperature: 0.5 } } },
      { 'anthropic:messages:claude-3-5-sonnet-20241022': { id: 'custom-id' } },
    ]);
    expect(providerIds).toEqual(['openai:gpt-4o-mini', 'custom-id']);
  });

  it('does not treat file:// paths without yaml/yml/json extension as file references', () => {
    const providerIds = getProviderIds('file://path/to/provider.js');
    expect(providerIds).toEqual(['file://path/to/provider.js']);
  });

  it('throws error for invalid provider type', () => {
    expect(() => getProviderIds(null as any)).toThrow('Invalid providers list');
  });
});

describe('resolveProvider', () => {
  let mockProviderMap: Record<string, any>;
  let mockProvider1: any;
  let mockProvider2: any;

  beforeEach(async () => {
    mockProvider1 = {
      id: () => 'provider-1',
      label: 'Provider One',
      callApi: vi.fn(),
    };

    mockProvider2 = {
      id: () => 'provider-2',
      callApi: vi.fn(),
    };

    mockProviderMap = {
      'provider-1': mockProvider1,
      'Provider One': mockProvider1,
      'provider-2': mockProvider2,
    };
  });

  it('should resolve provider by ID from providerMap', async () => {
    const { resolveProvider } = await import('../../src/providers');

    const result = await resolveProvider('provider-1', mockProviderMap);

    expect(result).toBe(mockProvider1);
  });

  it('should resolve provider by label from providerMap', async () => {
    const { resolveProvider } = await import('../../src/providers');

    const result = await resolveProvider('Provider One', mockProviderMap);

    expect(result).toBe(mockProvider1);
  });

  it('should throw error for null provider', async () => {
    const { resolveProvider } = await import('../../src/providers');

    await expect(resolveProvider(null, mockProviderMap)).rejects.toThrow(
      'Provider cannot be null or undefined',
    );
  });

  it('should throw error for undefined provider', async () => {
    const { resolveProvider } = await import('../../src/providers');

    await expect(resolveProvider(undefined, mockProviderMap)).rejects.toThrow(
      'Provider cannot be null or undefined',
    );
  });

  it('should throw error for invalid provider type', async () => {
    const { resolveProvider } = await import('../../src/providers');

    await expect(resolveProvider(123, mockProviderMap)).rejects.toThrow('Invalid provider type');
  });

  it('should handle function provider', async () => {
    const { resolveProvider } = await import('../../src/providers');

    const mockFunctionProvider: any = vi.fn(async (prompt: string) => {
      return { output: `Response for: ${prompt}` };
    });
    mockFunctionProvider.label = 'My Custom Provider';

    const result = await resolveProvider(mockFunctionProvider, mockProviderMap);

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('function');
    expect(result.id()).toBe('My Custom Provider');
    expect(result.callApi).toBe(mockFunctionProvider);
  });

  it('should handle function provider without label', async () => {
    const { resolveProvider } = await import('../../src/providers');

    const mockFunctionProvider = vi.fn(async (prompt: string) => {
      return { output: `Response for: ${prompt}` };
    });

    const result = await resolveProvider(mockFunctionProvider, mockProviderMap);

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('function');
    expect(result.id()).toBe('custom-function');
    expect(result.callApi).toBe(mockFunctionProvider);
  });

  it('should handle empty providerMap gracefully', async () => {
    const { resolveProvider } = await import('../../src/providers');

    // This should fall back to loadApiProvider for a known provider type
    // We'll test with 'echo' which is a simple provider type
    const result = await resolveProvider('echo', {});

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('function');
    expect(typeof result.callApi).toBe('function');
  });

  it('should prioritize providerMap over loadApiProvider', async () => {
    const { resolveProvider } = await import('../../src/providers');

    // Test that 'echo' gets resolved from providerMap instead of loadApiProvider
    const mockEchoProvider = {
      id: () => 'echo-from-map',
      callApi: vi.fn(),
    };

    const mapWithEcho = {
      ...mockProviderMap,
      echo: mockEchoProvider,
    };

    const result = await resolveProvider('echo', mapWithEcho);

    expect(result).toBe(mockEchoProvider);
    expect(result.id()).toBe('echo-from-map');
  });

  it('should accept basePath in context parameter', async () => {
    const { resolveProvider } = await import('../../src/providers');

    // This test verifies the function signature accepts basePath
    // The echo provider is used since it doesn't need file resolution
    const basePath = '/custom/base/path';
    const result = await resolveProvider('echo', {}, { basePath });

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('function');
  });

  it('should accept both env and basePath in context parameter', async () => {
    const { resolveProvider } = await import('../../src/providers');

    // This test verifies the function signature accepts both env and basePath
    const basePath = '/custom/base/path';
    const env = { API_KEY: 'test-key' };
    const result = await resolveProvider('echo', {}, { basePath, env });

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('function');
  });
});

describe('resolveProviderConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve string providers as-is', () => {
    const result = resolveProviderConfigs(['openai:gpt-4']);

    // Non-file string providers are preserved for loadApiProviders to handle
    expect(result).toEqual(['openai:gpt-4']);
  });

  it('should pass through ProviderOptions objects unchanged', () => {
    const providerOptions = {
      id: 'openai:gpt-4',
      prompts: ['prompt1', 'prompt2'],
      config: { temperature: 0.7 },
    };

    const result = resolveProviderConfigs([providerOptions]);

    expect(result).toEqual([providerOptions]);
  });

  it('should preserve ProviderOptionsMap format', () => {
    const providerMap = {
      'openai:gpt-4': {
        prompts: ['prompt1'],
        label: 'GPT-4 Model',
      },
    };
    const result = resolveProviderConfigs([providerMap]);

    // ProviderOptionsMap is preserved for loadApiProviders to handle
    expect(result).toEqual([providerMap]);
  });

  it('should preserve ProviderOptionsMap with explicit id', () => {
    const providerMap = {
      'openai:gpt-4': {
        id: 'custom-id',
        prompts: ['prompt1'],
      },
    };
    const result = resolveProviderConfigs([providerMap]);

    // ProviderOptionsMap is preserved for loadApiProviders to handle
    expect(result).toEqual([providerMap]);
  });

  it('should preserve function providers as-is', () => {
    const providerFn = (() => Promise.resolve({ output: 'test' })) as ProviderFunction;

    const result = resolveProviderConfigs([providerFn]);

    // Functions are preserved for loadApiProviders to handle
    expect(result).toEqual([providerFn]);
  });

  it('should preserve function providers with label as-is', () => {
    const providerFn = (() => Promise.resolve({ output: 'test' })) as ProviderFunction;
    (providerFn as any).label = 'My Custom Function';

    const result = resolveProviderConfigs([providerFn]);

    // Functions are preserved for loadApiProviders to handle
    expect(result).toEqual([providerFn]);
  });

  it('should resolve file:// YAML references and preserve prompts field', () => {
    const yamlContent = `
id: ollama:phi3
label: Phi3 Model
prompts:
  - phi3_prompt
config:
  temperature: 0.5
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const basePath = path.join(path.sep, 'test', 'path');
    const result = resolveProviderConfigs(['file://./providers/phi3.yaml'], {
      basePath,
    });

    expect(mockFsReadFileSync).toHaveBeenCalledWith(
      path.join(basePath, 'providers', 'phi3.yaml'),
      'utf8',
    );
    expect(result).toEqual([
      {
        id: 'ollama:phi3',
        label: 'Phi3 Model',
        prompts: ['phi3_prompt'],
        config: { temperature: 0.5 },
      },
    ]);
  });

  it('should resolve file:// with multiple providers in single file', () => {
    const yamlContent = `
- id: ollama:phi3
  prompts:
    - phi3_prompt
- id: ollama:gemma
  prompts:
    - gemma_prompt
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const basePath = path.join(path.sep, 'test', 'path');
    const result = resolveProviderConfigs(['file://./providers.yaml'], {
      basePath,
    });

    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(2);
    expect((result as any[])[0]).toEqual({ id: 'ollama:phi3', prompts: ['phi3_prompt'] });
    expect((result as any[])[1]).toEqual({ id: 'ollama:gemma', prompts: ['gemma_prompt'] });
  });

  it('should handle mixed provider types preserving non-file providers', () => {
    const yamlContent = `
id: ollama:phi3
prompts:
  - phi3_prompt
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const basePath = path.join(path.sep, 'test');
    const providerOptions = { id: 'anthropic:claude-3', prompts: ['claude_prompt'] };
    const result = resolveProviderConfigs(['openai:gpt-4', providerOptions, 'file://./phi3.yaml'], {
      basePath,
    });

    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(3);
    // String providers are preserved as-is
    expect((result as any[])[0]).toEqual('openai:gpt-4');
    // ProviderOptions are preserved as-is
    expect((result as any[])[1]).toEqual(providerOptions);
    // file:// references are resolved to ProviderOptions
    expect((result as any[])[2]).toEqual({ id: 'ollama:phi3', prompts: ['phi3_prompt'] });
  });

  it('should preserve single string provider (not array)', () => {
    const result = resolveProviderConfigs('openai:gpt-4');

    // Single non-file string is preserved as-is
    expect(result).toEqual('openai:gpt-4');
  });

  it('should resolve single file:// string provider (not array)', () => {
    const yamlContent = `
id: ollama:phi3
prompts:
  - phi3_prompt
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const basePath = path.join(path.sep, 'test');
    const result = resolveProviderConfigs('file://./phi3.yaml', { basePath });

    // file:// references are resolved to array of ProviderOptions
    expect(result).toEqual([{ id: 'ollama:phi3', prompts: ['phi3_prompt'] }]);
  });

  it('should preserve single function provider (not array)', () => {
    const providerFn = (() => Promise.resolve({ output: 'test' })) as ProviderFunction;

    const result = resolveProviderConfigs(providerFn);

    // Functions are preserved as-is
    expect(result).toBe(providerFn);
  });

  it('should return input as-is for non-array, non-string, non-function input', () => {
    const emptyObj = {} as any;
    const result = resolveProviderConfigs(emptyObj);

    // Non-standard input is returned as-is
    expect(result).toBe(emptyObj);
  });

  it('should handle absolute file paths', () => {
    const yamlContent = `
id: ollama:phi3
prompts:
  - phi3_prompt
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const absolutePath = path.join(path.sep, 'absolute', 'path', 'provider.yaml');
    const result = resolveProviderConfigs([`file://${absolutePath}`]);

    expect(mockFsReadFileSync).toHaveBeenCalledWith(absolutePath, 'utf8');
    expect(result).toEqual([{ id: 'ollama:phi3', prompts: ['phi3_prompt'] }]);
  });

  it('should handle .yml extension', () => {
    const yamlContent = `
id: ollama:phi3
prompts:
  - phi3_prompt
`;
    mockFsReadFileSync.mockReturnValue(yamlContent);

    const basePath = path.join(path.sep, 'test');
    const result = resolveProviderConfigs(['file://./provider.yml'], { basePath });

    expect(mockFsReadFileSync).toHaveBeenCalledWith(path.join(basePath, 'provider.yml'), 'utf8');
    expect(result).toEqual([{ id: 'ollama:phi3', prompts: ['phi3_prompt'] }]);
  });

  it('should handle .json extension', () => {
    const jsonContent = JSON.stringify({
      id: 'openai:gpt-4',
      prompts: ['gpt_prompt'],
    });
    mockFsReadFileSync.mockReturnValue(jsonContent);

    const basePath = path.join(path.sep, 'test');
    const result = resolveProviderConfigs(['file://./provider.json'], { basePath });

    expect(mockFsReadFileSync).toHaveBeenCalledWith(path.join(basePath, 'provider.json'), 'utf8');
    expect(result).toEqual([{ id: 'openai:gpt-4', prompts: ['gpt_prompt'] }]);
  });
});
