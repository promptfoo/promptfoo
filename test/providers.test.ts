import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { loadApiProvider, loadApiProviders } from '../src/providers';
import { HttpProvider } from '../src/providers/http';
import { OpenAiChatCompletionProvider } from '../src/providers/openai';
import { PythonProvider } from '../src/providers/pythonCompletion';
import { ScriptCompletionProvider } from '../src/providers/scriptCompletion';
import { WebSocketProvider } from '../src/providers/websocket';
import type { ProviderOptions } from '../src/types';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../src/providers/openai');
jest.mock('../src/providers/http');
jest.mock('../src/providers/websocket');
jest.mock('../src/providers/scriptCompletion');
jest.mock('../src/providers/pythonCompletion');

describe('loadApiProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  it('should load echo provider', async () => {
    const provider = await loadApiProvider('echo');
    expect(provider.id()).toBe('echo');
    await expect(provider.callApi('test')).resolves.toEqual({ output: 'test' });
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

  it('should load OpenAI chat provider', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-4');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('gpt-4', expect.any(Object));
    expect(provider).toBeDefined();
  });

  it('should load HTTP provider', async () => {
    const provider = await loadApiProvider('http://test.com');
    expect(HttpProvider).toHaveBeenCalledWith('http://test.com', expect.any(Object));
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
});

describe('loadApiProviders', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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

  it('should throw error for invalid providers list', async () => {
    await expect(loadApiProviders({} as any)).rejects.toThrow('Invalid providers list');
  });
});
