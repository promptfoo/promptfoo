import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { CLOUD_PROVIDER_PREFIX } from '../src/constants';
import { HttpProvider } from '../src/providers/http';
import { loadApiProvider, loadApiProviders } from '../src/providers/index';
import { OpenAiChatCompletionProvider } from '../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../src/providers/openai/embedding';
import { PythonProvider } from '../src/providers/pythonCompletion';
import { ScriptCompletionProvider } from '../src/providers/scriptCompletion';
import { WebSocketProvider } from '../src/providers/websocket';
import { getCloudDatabaseId, getProviderFromCloud, isCloudProvider } from '../src/util/cloud';
import * as fileUtil from '../src/util/file';

import type { ProviderOptions } from '../src/types/index';

vi.mock('fs');
vi.mock('js-yaml');
vi.mock('../src/util/fetch/index.ts');
vi.mock('../src/providers/http');
vi.mock('../src/providers/openai/chat');
vi.mock('../src/providers/openai/embedding');
vi.mock('../src/providers/pythonCompletion');
vi.mock('../src/providers/scriptCompletion');
vi.mock('../src/providers/websocket');
vi.mock('../src/util/cloud');
vi.mock('../src/util/file', async () => {
  const actual = await vi.importActual<typeof import('../src/util/file')>('../src/util/file');
  return {
    ...actual,
    maybeLoadConfigFromExternalFile: vi.fn((input) => input),
  };
});

describe('loadApiProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Mock the cloud utility functions
    vi.mocked(isCloudProvider).mockImplementation((path: string) =>
      path.startsWith('promptfoo://provider/'),
    );
    vi.mocked(getCloudDatabaseId).mockImplementation((path: string) =>
      path.slice('promptfoo://provider/'.length),
    );

    // Reset maybeLoadConfigFromExternalFile mock to default implementation
    vi.mocked(fileUtil.maybeLoadConfigFromExternalFile).mockImplementation((input: any) => input);
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
        numRequests: 1,
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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonContent));
    vi.mocked(yaml.load).mockReturnValue(jsonContent);

    const provider = await loadApiProvider('file://test.json', {
      basePath: '/test',
    });

    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/test', 'test.json'), 'utf8');
    expect(yaml.load).toHaveBeenCalledWith(JSON.stringify(jsonContent));
    expect(provider).toBeDefined();
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
  });

  it('should recursively resolve file:// references in provider config from yaml', async () => {
    const yamlContentWithRefs: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'file://api-key.txt',
        temperature: 'file://temperature.json',
        tools: 'file://tools.yaml',
      },
    };

    const resolvedContent: ProviderOptions = {
      id: 'openai:chat:gpt-4',
      config: {
        apiKey: 'sk-test-key-12345',
        temperature: 0.7,
        tools: [{ name: 'search', description: 'Search the web' }],
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContentWithRefs);
    vi.mocked(fileUtil.maybeLoadConfigFromExternalFile).mockReturnValue(resolvedContent);

    const _provider = await loadApiProvider('file://provider.yaml', {
      basePath: '/test',
    });

    expect(fileUtil.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(yamlContentWithRefs);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', {
      config: expect.objectContaining({
        apiKey: 'sk-test-key-12345',
        temperature: 0.7,
        tools: [{ name: 'search', description: 'Search the web' }],
      }),
      id: 'openai:chat:gpt-4',
    });
  });

  it('should recursively resolve file:// references in provider config from json', async () => {
    const jsonContentWithRefs: ProviderOptions = {
      id: 'openai:chat:gpt-3.5-turbo',
      config: {
        apiKey: 'file://secrets/api-key.txt',
        systemPrompt: 'file://prompts/system.md',
      },
    };

    const resolvedContent: ProviderOptions = {
      id: 'openai:chat:gpt-3.5-turbo',
      config: {
        apiKey: 'sk-prod-key-67890',
        systemPrompt: 'You are a helpful assistant.',
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonContentWithRefs));
    vi.mocked(yaml.load).mockReturnValue(jsonContentWithRefs);
    vi.mocked(fileUtil.maybeLoadConfigFromExternalFile).mockReturnValue(resolvedContent);

    const _provider = await loadApiProvider('file://provider.json', {
      basePath: '/test',
    });

    expect(fileUtil.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(jsonContentWithRefs);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-3.5-turbo', {
      config: expect.objectContaining({
        apiKey: 'sk-prod-key-67890',
        systemPrompt: 'You are a helpful assistant.',
      }),
      id: 'openai:chat:gpt-3.5-turbo',
    });
  });

  it('should load Provider from cloud', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://path/to/custom_provider.py:call_api',
      config: {
        apiKey: 'test-key',
        temperature: 0.7,
      },
    });
    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`);

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/custom_provider\.py/),
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'test-key',
          temperature: 0.7,
        }),
        id: 'file://path/to/custom_provider.py:call_api',
      }),
    );
  });

  it('should merge local config overrides with cloud provider config', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://providers/custom_llm.py:generate',
      config: {
        apiKey: 'cloud-api-key',
        temperature: 0.7,
        maxTokens: 1000,
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        config: {
          temperature: 0.9, // Override cloud temperature
          topP: 0.95, // Add new config field
        },
      },
    });

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/custom_llm\.py/),
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'cloud-api-key', // Preserved from cloud
          temperature: 0.9, // Overridden locally
          maxTokens: 1000, // Preserved from cloud
          topP: 0.95, // Added locally
        }),
        id: 'file://providers/custom_llm.py:generate',
      }),
    );
  });

  it('should override cloud provider label with local label', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://models/sentiment.py:analyze',
      label: 'Cloud Label',
      config: {
        apiKey: 'test-key',
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        label: 'Local Override Label',
      },
    });

    expect(provider).toBeDefined();
    expect(provider.label).toBe('Local Override Label');
  });

  it('should override cloud provider transform with local transform', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://adapters/wrapper.py:call_model',
      transform: 'response.cloudTransform',
      config: {
        apiKey: 'test-key',
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        transform: 'response.localTransform',
      },
    });

    expect(provider).toBeDefined();
    expect(provider.transform).toBe('response.localTransform');
  });

  it('should override cloud provider delay with local delay', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://rate_limited/api.py:fetch',
      delay: 1000,
      config: {
        apiKey: 'test-key',
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        delay: 2000,
      },
    });

    expect(provider).toBeDefined();
    expect(provider.delay).toBe(2000);
  });

  it('should merge cloud provider env with local env overrides', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://integrations/external_api.py:query',
      config: {
        apiKey: 'test-key',
      },
      env: {
        ANTHROPIC_API_KEY: 'cloud-anthropic-key',
        OPENAI_API_KEY: 'cloud-openai-key',
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        env: {
          OPENAI_API_KEY: 'local-openai-key', // Override
          GOOGLE_API_KEY: 'local-google-key', // Add new
        },
      },
    });

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/external_api\.py/),
      expect.objectContaining({
        config: expect.any(Object),
        env: {
          ANTHROPIC_API_KEY: 'cloud-anthropic-key', // Preserved
          OPENAI_API_KEY: 'local-openai-key', // Overridden
          GOOGLE_API_KEY: 'local-google-key', // Added
        },
        id: 'file://integrations/external_api.py:query',
      }),
    );
  });

  it('should merge context env, cloud provider env, and local env overrides', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://integrations/external_api.py:query',
      config: {
        apiKey: 'test-key',
      },
      env: {
        ANTHROPIC_API_KEY: 'cloud-anthropic-key',
        OPENAI_API_KEY: 'cloud-openai-key',
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      env: {
        MISTRAL_API_KEY: 'context-mistral-key',
        OPENAI_API_KEY: 'context-openai-key', // Will be overridden by cloud
      },
      options: {
        env: {
          OPENAI_API_KEY: 'local-openai-key', // Highest priority - overrides both
          GOOGLE_API_KEY: 'local-google-key', // Added by local
        },
      },
    });

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/external_api\.py/),
      expect.objectContaining({
        config: expect.any(Object),
        env: {
          MISTRAL_API_KEY: 'context-mistral-key', // From context
          ANTHROPIC_API_KEY: 'cloud-anthropic-key', // From cloud
          OPENAI_API_KEY: 'local-openai-key', // Local wins (overrides cloud and context)
          GOOGLE_API_KEY: 'local-google-key', // From local
        },
        id: 'file://integrations/external_api.py:query',
      }),
    );
  });

  it('should preserve cloud provider config when no local overrides provided', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://enterprise/secure_llm.py:invoke',
      label: 'Cloud Label',
      transform: 'response.transform',
      delay: 500,
      config: {
        apiKey: 'cloud-key',
        temperature: 0.8,
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`);

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/secure_llm\.py/),
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'cloud-key',
          temperature: 0.8,
        }),
        id: 'file://enterprise/secure_llm.py:invoke',
      }),
    );
    expect(provider.transform).toBe('response.transform');
    expect(provider.delay).toBe(500);
  });

  it('should handle cloud provider with empty local config override', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({
      id: 'file://backend/inference.py:predict',
      config: {
        apiKey: 'cloud-key',
        temperature: 0.7,
      },
    });

    const provider = await loadApiProvider(`${CLOUD_PROVIDER_PREFIX}123`, {
      options: {
        config: {}, // Empty override
      },
    });

    expect(provider).toBeDefined();
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/inference\.py/),
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'cloud-key',
          temperature: 0.7,
        }),
        id: 'file://backend/inference.py:predict',
      }),
    );
  });

  it('should load OpenAI chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-4.1');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4.1', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI GPT-5 chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-5');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-5', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI GPT-5 chat latest provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-5-chat-latest');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'gpt-5-chat-latest',
      expect.any(Object),
    );
    expect(provider).toBeDefined();
  });

  it('should load OpenAI GPT-5 nano chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-5-nano');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-5-nano', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI GPT-5 mini chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-5-mini');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-5-mini', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load OpenAI chat provider with default model', async () => {
    const provider = await loadApiProvider('openai:chat');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'gpt-4.1-2025-04-14',
      expect.any(Object),
    );
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
    expect(provider).toBeDefined();
  });

  it('should load DeepSeek provider with specific model', async () => {
    const provider = await loadApiProvider('deepseek:deepseek-reasoner');
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

  it('should load GitHub provider with default model', async () => {
    const provider = await loadApiProvider('github:');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-5', {
      config: expect.objectContaining({
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      }),
    });
    expect(provider).toBeDefined();
  });

  it('should load GitHub provider with specific model', async () => {
    const provider = await loadApiProvider('github:openai/gpt-4o-mini');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-4o-mini', {
      config: expect.objectContaining({
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      }),
    });
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
    expect(ScriptCompletionProvider).toHaveBeenCalledWith(
      expect.stringMatching(/test\.sh$/),
      expect.any(Object),
    );
    expect(provider).toBeDefined();
  });

  it('should load Python provider', async () => {
    const provider = await loadApiProvider('python:test.py');
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/test\.py$/),
      expect.any(Object),
    );
    expect(provider).toBeDefined();
  });

  it('should load Python provider from file path', async () => {
    const provider = await loadApiProvider('file://test.py');
    expect(PythonProvider).toHaveBeenCalledWith(
      expect.stringMatching(/test\.py$/),
      expect.any(Object),
    );
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
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    await expect(loadApiProvider('file://invalid.yaml')).rejects.toThrow('File not found');
  });

  it('should handle invalid yaml content', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid: yaml: content:');
    vi.mocked(yaml.load).mockReturnValue(null);
    await expect(loadApiProvider('file://invalid.yaml')).rejects.toThrow('Provider config');
  });

  it('should handle yaml config without id', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('config:\n  key: value');
    vi.mocked(yaml.load).mockReturnValue({ config: { key: 'value' } });
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
    vi.mocked(PythonProvider).mockImplementation(function (this: any) {
      Object.assign(this, mockProvider);
      return this;
    } as any);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.resetAllMocks();
    cliState.config = undefined;

    // Reset maybeLoadConfigFromExternalFile mock to default implementation
    vi.mocked(fileUtil.maybeLoadConfigFromExternalFile).mockImplementation((input: any) => input);
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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

    const absolutePath = path.resolve('/absolute/path/to/providers.yaml');
    const providers = await loadApiProviders(`file://${absolutePath}`);

    expect(providers).toHaveLength(1);
    expect(fs.readFileSync).toHaveBeenCalledWith(absolutePath, 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should load multiple providers from a file specified in a providers array', async () => {
    // Setup mock file with multiple providers
    const yamlContent = [
      {
        id: 'echo',
        config: { prefix: 'Echo Provider: ' },
      },
      {
        id: 'openai:gpt-4o-mini',
        config: { temperature: 0.1 },
      },
    ];
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

    // Create provider array with a mix of direct provider and file reference
    const providerArray = [
      'anthropic:claude-3-5-sonnet-20241022',
      'file://./providers.yaml', // This should expand to the two providers above
    ];

    const providers = await loadApiProviders(providerArray);

    // We should get 3 providers: 1 direct + 2 from file
    expect(providers).toHaveLength(3);

    // Just verify that all providers are defined
    providers.forEach((provider) => {
      expect(provider).toBeDefined();
    });

    // Verify file was read correctly
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('providers.yaml'), 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should handle nested arrays of providers from multiple file references', async () => {
    // First file
    const firstFileContent = [
      {
        id: 'echo',
        config: { prefix: 'First file: ' },
      },
    ];

    // Second file
    const secondFileContent = [
      {
        id: 'openai:gpt-4o-mini',
        config: { temperature: 0.1 },
      },
      {
        id: 'anthropic:claude-3-5-sonnet-20241022',
        config: { temperature: 0.7 },
      },
    ];

    // Mock the file system read for different paths
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath.toString().includes('first.yaml')) {
        return 'first file content';
      } else if (filePath.toString().includes('second.yaml')) {
        return 'second file content';
      }
      return '';
    });

    // Mock yaml loading based on different file contents
    vi.mocked(yaml.load).mockImplementation((content) => {
      if (content === 'first file content') {
        return firstFileContent;
      } else if (content === 'second file content') {
        return secondFileContent;
      }
      return null;
    });

    // Provider array with multiple file references
    const providerArray = ['file://./first.yaml', 'file://./second.yaml'];

    const providers = await loadApiProviders(providerArray);

    // We should get 3 providers total: 1 from first file + 2 from second file
    expect(providers).toHaveLength(3);

    // Just verify all providers are defined
    providers.forEach((provider) => {
      expect(provider).toBeDefined();
    });

    // Verify both files were read
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('first.yaml'), 'utf8');
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('second.yaml'), 'utf8');
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
    vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockReturnValue(yamlContent);

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
