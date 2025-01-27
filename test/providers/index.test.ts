import dedent from 'dedent';
import * as fs from 'fs';
import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { LlamaProvider } from '../../src/providers/llama';
import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
} from '../../src/providers/openai';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { WebhookProvider } from '../../src/providers/webhook';

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

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/esm', () => ({
  ...jest.requireActual('../../src/esm'),
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

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
}));
jest.mock('../../src/providers/websocket');

const mockFetch = jest.mocked(jest.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: jest.fn().mockReturnValue(null),
    entries: jest.fn().mockReturnValue([]),
  },
};

// Dynamic import
jest.mock('../../src/providers/adaline.gateway', () => ({
  AdalineGatewayChatProvider: jest.fn().mockImplementation((providerName, modelName) => ({
    id: () => `adaline:${providerName}:chat:${modelName}`,
    constructor: { name: 'AdalineGatewayChatProvider' },
  })),
  AdalineGatewayEmbeddingProvider: jest.fn().mockImplementation((providerName, modelName) => ({
    id: () => `adaline:${providerName}:embedding:${modelName}`,
    constructor: { name: 'AdalineGatewayEmbeddingProvider' },
  })),
}));

describe('call provider apis', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
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
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new LlamaProvider('llama.cpp');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
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
    mockFetch.mockResolvedValue(mockResponse);

    const provider = new WebhookProvider('http://example.com/webhook');
    const result = await provider.callApi('Test prompt');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
  });
});

describe('loadApiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loadApiProvider with yaml filepath', async () => {
    const mockYamlContent = dedent`
    id: 'openai:gpt-4'
    config:
      key: 'value'`;
    const mockReadFileSync = jest.mocked(fs.readFileSync);
    mockReadFileSync.mockReturnValue(mockYamlContent);

    const provider = await loadApiProvider('file://path/to/mock-provider-file.yaml');
    expect(provider.id()).toBe('openai:gpt-4');
    expect(mockReadFileSync).toHaveBeenCalledWith(
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

  it('loadApiProvider with llama:modelName', async () => {
    const provider = await loadApiProvider('llama');
    expect(provider).toBeInstanceOf(LlamaProvider);
  });

  it('loadApiProvider with webhook', async () => {
    const provider = await loadApiProvider('webhook:http://example.com/webhook');
    expect(provider).toBeInstanceOf(WebhookProvider);
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

  it('loadApiProvider with adaline:openai:chat', async () => {
    const provider = await loadApiProvider('adaline:openai:chat:gpt-4');
    expect(provider.id()).toBe('adaline:openai:chat:gpt-4');
  });

  it('loadApiProvider with adaline:openai:embedding', async () => {
    const provider = await loadApiProvider('adaline:openai:embedding:text-embedding-3-large');
    expect(provider.id()).toBe('adaline:openai:embedding:text-embedding-3-large');
  });

  it('should throw error for invalid adaline provider path', async () => {
    await expect(loadApiProvider('adaline:invalid')).rejects.toThrow(
      "Invalid adaline provider path: adaline:invalid. path format should be 'adaline:<provider_name>:<model_type>:<model_name>' eg. 'adaline:openai:chat:gpt-4o'",
    );
  });
});
