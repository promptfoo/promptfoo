import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import cliState from '../src/cliState';
import { CLOUD_PROVIDER_PREFIX } from '../src/constants';
import { loadApiProvider, loadApiProviders } from '../src/providers';
import { HttpProvider } from '../src/providers/http';
import { OpenAiChatCompletionProvider } from '../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../src/providers/openai/embedding';
import { PythonProvider } from '../src/providers/pythonCompletion';
import { ScriptCompletionProvider } from '../src/providers/scriptCompletion';
import { WebSocketProvider } from '../src/providers/websocket';
import type { ProviderOptions } from '../src/types';
import { getProviderFromCloud } from '../src/util/cloud';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../src/fetch');
jest.mock('../src/providers/http');
jest.mock('../src/providers/openai/chat');
jest.mock('../src/providers/openai/embedding');
jest.mock('../src/providers/pythonCompletion');
jest.mock('../src/providers/scriptCompletion');
jest.mock('../src/providers/websocket');
jest.mock('../src/util/cloud');

describe('loadApiProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  it('should load echo provider', async () => {
    const provider = await loadApiProvider('echo');
    expect(provider.id()).toBe('echo');
    await expect(provider.callApi('test')).resolves.toEqual({
      output: 'test',
      raw: 'test',
      cost: 0,
      cached: false,
      isRefusal: false,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
      },
      metadata: {},
    });
  });

  it('should load file provider from yaml', async () => {
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'test-key',
        temperature: 0.7,
      },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const provider = await loadApiProvider('file://test.yaml', {
      basePath: '/test',
    });

    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/test', 'test.yaml'), 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should load file provider from json', async () => {
    const jsonContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'test-key',
      },
    };
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonContent));
    jest.mocked(yaml.load).mockReturnValue(jsonContent);

    const provider = await loadApiProvider('file://test.json', {
      basePath: '/test',
    });

    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/test', 'test.json'), 'utf8');
    expect(yaml.load).toHaveBeenCalledWith(JSON.stringify(jsonContent));
    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should load Provider from cloud', async () => {
    jest.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'test-key',
        temperature: 0.7,
      },
    });
    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`);

    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', {
      config: expect.objectContaining({
        apiKey: 'test-key',
        temperature: 0.7,
      }),
      id: 'openai:chat:gpt-4',
    });
  });

  it('should load OpenAI chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-4');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI chat provider with default model', async () => {
    const provider = await loadApiProvider('openai:chat');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4o-mini', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI embedding provider', async () => {
    const provider = await loadApiProvider('openai:embedding');
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
      'text-embedding-3-large',
      expect.any(Object),
    );
    expect(provider).toBeDefined();
  });

  it('should load DeepSeek provider with default model', async () => {
    const provider = await loadApiProvider('deepseek:');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('deepseek-chat', {
      config: expect.objectContaining({
        apiBaseUrl: 'https://api.deepseek.com/v1',
        apiKeyEnvar: 'DEEPSEEK_API_KEY',
      }),
    });
    expect(provider).toBeDefined();
  });

  it('should load DeepSeek provider with specific model', async () => {
    const provider = await loadApiProvider('deepseek:deepseek-coder');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('deepseek-coder', {
      config: expect.objectContaining({
        apiBaseUrl: 'https://api.deepseek.com/v1',
        apiKeyEnvar: 'DEEPSEEK_API_KEY',
      }),
    });
    expect(provider).toBeDefined();
  });

  it('should load Hyperbolic provider with specific model', async () => {
    const provider = await loadApiProvider('hyperbolic:meta-llama/Meta-Llama-3-8B-Instruct-Turbo');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'meta-llama/Meta-Llama-3-8B-Instruct-Turbo',
      {
        config: expect.objectContaining({
          apiBaseUrl: 'https://api.hyperbolic.xyz/v1',
          apiKeyEnvar: 'HYPERBOLIC_API_KEY',
        }),
      },
    );
    expect(provider).toBeDefined();
  });

  it('should load HTTP provider', async () => {
    const provider = await loadApiProvider('http://test.com');
    expect(HttpProvider).toHaveBeenCalledWith('http://test.com', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load HTTPS provider', async () => {
    const provider = await loadApiProvider('https://test.com');
    expect(HttpProvider).toHaveBeenCalledWith('https://test.com', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load WebSocket provider', async () => {
    const provider = await loadApiProvider('ws://test.com');
    expect(WebSocketProvider).toHaveBeenCalledWith('ws://test.com', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load script provider', async () => {
    const provider = await loadApiProvider('exec:test.sh');
    expect(ScriptCompletionProvider).toHaveBeenCalledWith('test.sh', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load Python provider', async () => {
    const provider = await loadApiProvider('python:test.py');
    expect(PythonProvider).toHaveBeenCalledWith('test.py', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load Python provider from file path', async () => {
    const provider = await loadApiProvider('file://test.py');
    expect(PythonProvider).toHaveBeenCalledWith('test.py', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should handle unidentified provider', async () => {
    await expect(loadApiProvider('unknown:provider')).rejects.toThrow(
      'Could not identify provider',
    );
  });

  it('should load JFrog ML provider', async () => {
    const provider = await loadApiProvider('jfrog:test-model');
    expect(provider).toBeDefined();
  });

  it('should handle invalid file path for yaml/json config', async () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    await expect(loadApiProvider('file://invalid.yaml')).rejects.toThrow('File not found');
  });

  it('should handle invalid yaml content', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('invalid: yaml: content:');
    jest.mocked(yaml.load).mockReturnValue(null);
    await expect(loadApiProvider('file://invalid.yaml')).rejects.toThrow('Provider config');
  });

  it('should handle yaml config without id', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('config:\n  key: value');
    jest.mocked(yaml.load).mockReturnValue({ config: { key: 'value' } });
    await expect(loadApiProvider('file://invalid.yaml')).rejects.toThrow('must have an id');
  });

  it('should handle provider with custom base path', async () => {
    const mockProvider = {
      id: () => 'python:script.py',
      config: {
        basePath: '/custom/path',
      },
      callApi: async (input: string) => ({ output: input }),
    };
    jest.mocked(PythonProvider).mockImplementation(() => mockProvider as any);

    const provider = await loadApiProvider('python:script.py', {
      basePath: '/custom/path',
      options: {
        config: {},
      },
    });
    expect(provider.config.basePath).toBe('/custom/path');
  });

  it('should handle provider with delay', async () => {
    const provider = await loadApiProvider('echo', {
      options: {
        delay: 1000,
      },
    });
    expect(provider.delay).toBe(1000);
  });

  it('should handle provider with custom label template', async () => {
    process.env.CUSTOM_LABEL = 'my-label';
    const provider = await loadApiProvider('echo', {
      options: {
        label: '{{ env.CUSTOM_LABEL }}',
      },
    });
    expect(provider.label).toBe('my-label');
    delete process.env.CUSTOM_LABEL;
  });

  it('should throw error when file provider array is loaded with loadApiProvider', async () => {
    const yamlContent = [
      {
        id: 'openai:chat:gpt-4',
        config: { apiKey: 'test-key1' },
      },
      {
        id: 'anthropic:claude-2',
        config: { apiKey: 'test-key2' },
      },
    ];
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    await expect(loadApiProvider('file://test.yaml')).rejects.toThrow(
      'Multiple providers found in test.yaml. Use loadApiProviders instead of loadApiProvider.',
    );
  });

  it('should handle file provider with environment variables', async () => {
    process.env.OPENAI_API_KEY = 'test-key-from-env';
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: '{{ env.OPENAI_API_KEY }}',
      },
      env: {
        OPENAI_API_KEY: 'override-key',
      },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const provider = await loadApiProvider('file://test.yaml', {
      basePath: '/test',
      env: { OPENAI_API_KEY: 'final-override-key' },
    });

    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'gpt-4',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: expect.any(String),
        }),
        env: expect.objectContaining({
          OPENAI_API_KEY: 'final-override-key',
        }),
      }),
    );
    delete process.env.OPENAI_API_KEY;
  });

  it('should load multiple providers from yaml file using loadApiProviders', async () => {
    const yamlContent = [
      {
        id: 'openai:chat:gpt-4o-mini',
        config: { apiKey: 'test-key1' },
      },
      {
        id: 'anthropic:claude-3-7-sonnet-20250219',
        config: { apiKey: 'test-key2' },
      },
    ];
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const providers = await loadApiProviders('file://test.yaml');
    expect(providers).toHaveLength(2);
    expect(providers[0]).toBeDefined();
    expect(providers[1]).toBeDefined();
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.yaml'), 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should handle absolute file paths', async () => {
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: { apiKey: 'test-key' },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const absolutePath = path.resolve('/absolute/path/to/providers.yaml');
    const provider = await loadApiProvider(`file://${absolutePath}`);

    expect(provider).toBeDefined();
    expect(fs.readFileSync).toHaveBeenCalledWith(absolutePath, 'utf8');
  });

  it('should handle provider with null or undefined config values', async () => {
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'test-key',
        nullValue: null,
        undefinedValue: undefined,
      },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const provider = await loadApiProvider('file://test.yaml');
    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'gpt-4',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'test-key',
        }),
      }),
    );
  });

  it('should handle provider with undefined options', async () => {
    const provider = await loadApiProvider('echo', {
      options: undefined,
    });
    expect(provider).toBeDefined();
  });

  it('should throw error for invalid providerPaths type', async () => {
    // Test with a number, which is an invalid type
    await expect(loadApiProviders(42 as any)).rejects.toThrow('Invalid providers list');

    // Test with an object that doesn't match any valid format
    await expect(loadApiProviders({ foo: 'bar' } as any)).rejects.toThrow('Invalid providers list');
  });

  it('should handle non-yaml/json file paths', async () => {
    // Test with a text file path
    await expect(loadApiProviders('file://test.txt')).rejects.toThrow(
      /Could not identify provider/,
    );
  });
});

describe('loadApiProviders', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.config = undefined;
  });

  it('should load single provider from string', async () => {
    const providers = await loadApiProviders('echo');
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('echo');
  });

  it('should load multiple providers from array of strings', async () => {
    const providers = await loadApiProviders(['echo', 'openai:chat:gpt-4']);
    expect(providers).toHaveLength(2);
    expect(providers[0].id()).toBe('echo');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should load provider from function', async () => {
    const customFunction = async (prompt: string) => ({ output: prompt });
    const providers = await loadApiProviders(customFunction);
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('custom-function');
    await expect(providers[0].callApi('test')).resolves.toEqual({ output: 'test' });
  });

  it('should load provider from function with label', async () => {
    const customFunction = async (prompt: string) => ({ output: prompt });
    customFunction.label = 'custom-label';
    const providers = await loadApiProviders([customFunction]);
    expect(providers).toHaveLength(1);
    expect(providers[0].id()).toBe('custom-label');
  });

  it('should load provider from options object', async () => {
    const options: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'test-key',
      },
    };
    const providers = await loadApiProviders([options]);
    expect(providers).toHaveLength(1);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should load provider from options map', async () => {
    const providers = await loadApiProviders([
      {
        'openai:chat:gpt-4': {
          config: {
            apiKey: 'test-key',
          },
        },
      },
    ]);
    expect(providers).toHaveLength(1);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should throw error for invalid providers list', async () => {
    await expect(loadApiProviders({} as any)).rejects.toThrow('Invalid providers list');
  });

  it('should handle loadApiProviders with empty array', async () => {
    const providers = await loadApiProviders([]);
    expect(providers).toHaveLength(0);
  });

  it('should handle loadApiProviders with mixed provider types', async () => {
    const customFunction = async (prompt: string) => ({ output: prompt });
    const providers = await loadApiProviders([
      'echo',
      customFunction,
      { id: 'openai:chat', config: {} },
      { 'openai:completion': { config: {} } },
    ]);
    expect(providers).toHaveLength(4);
  });

  it('should handle provider with null config', async () => {
    const provider = await loadApiProvider('echo', {
      options: {
        config: null,
      },
    });
    expect(provider).toBeDefined();
  });

  it('should handle provider with undefined options', async () => {
    const provider = await loadApiProvider('echo', {
      options: undefined,
    });
    expect(provider).toBeDefined();
  });

  it('should handle relative file paths', async () => {
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: { apiKey: 'test-key' },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const relativePath = 'relative/path/to/providers.yaml';
    const providers = await loadApiProviders(`file://${relativePath}`, {
      basePath: '/test/base/path',
    });

    expect(providers).toHaveLength(1);
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join('/test/base/path', relativePath),
      'utf8',
    );
  });

  it('should handle absolute file paths in loadApiProviders', async () => {
    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: { apiKey: 'test-key' },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const absolutePath = path.resolve('/absolute/path/to/providers.yaml');
    const providers = await loadApiProviders(`file://${absolutePath}`);

    expect(providers).toHaveLength(1);
    expect(fs.readFileSync).toHaveBeenCalledWith(absolutePath, 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should use env values from cliState.config', async () => {
    // Set up dummy config with env block
    cliState.config = {
      env: {
        TEST_API_KEY: 'test-key-from-cli-state',
        OTHER_VAR: 'other-value',
      },
    };

    const yamlContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: '{{ env.TEST_API_KEY }}',
      },
    };
    jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const providers = await loadApiProviders('file://test.yaml');

    expect(providers).toHaveLength(1);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'gpt-4',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: expect.any(String),
        }),
        env: expect.objectContaining({
          TEST_API_KEY: 'test-key-from-cli-state',
          OTHER_VAR: 'other-value',
        }),
      }),
    );
  });
});
