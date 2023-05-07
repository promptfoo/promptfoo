import fetch from 'node-fetch';

import {
  OpenAiGenericProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  loadApiProvider,
} from '../src/providers.js';

jest.mock('node-fetch', () => jest.fn());

jest.mock('../src/esm.js');

describe('providers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('OpenAiGenericProvider constructor', () => {
    const provider = new OpenAiGenericProvider('gpt-3.5-turbo', 'test-api-key');
    expect(provider.modelName).toBe('gpt-3.5-turbo');
    expect(provider.apiKey).toBe('test-api-key');
  });

  test('OpenAiCompletionProvider callApi', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        choices: [{ text: 'Test output' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      }),
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiCompletionProvider('text-davinci-003', 'test-api-key');
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
    };
    (fetch as unknown as jest.Mock).mockResolvedValue(mockResponse);

    const provider = new OpenAiChatCompletionProvider('gpt-3.5-turbo', 'test-api-key');
    const result = await provider.callApi('Test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Test output');
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('loadApiProvider with openai:chat', async () => {
    const provider = await loadApiProvider('openai:chat');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  test('loadApiProvider with openai:completion', async () => {
    const provider = await loadApiProvider('openai:completion');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });

  test('loadApiProvider with openai:chat:modelName', async () => {
    const provider = await loadApiProvider('openai:chat:gpt-3.5-turbo');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  });

  test('loadApiProvider with openai:completion:modelName', async () => {
    const provider = await loadApiProvider('openai:completion:text-davinci-003');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
  });
});
