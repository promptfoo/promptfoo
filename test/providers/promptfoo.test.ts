import { fetchWithCache } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import { fetchWithRetries } from '../../src/fetch';
import { getUserEmail } from '../../src/globalConfig/accounts';
import {
  PromptfooHarmfulCompletionProvider,
  PromptfooChatCompletionProvider,
  PromptfooSimulatedUserProvider,
} from '../../src/providers/promptfoo';

jest.mock('../../src/cache');
jest.mock('../../src/envars');
jest.mock('../../src/fetch');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud', () => ({
  CloudConfig: class {
    isEnabled() {
      return false;
    }
    getApiHost() {
      return 'https://api.promptfoo.app';
    }
  },
}));

describe('PromptfooHarmfulCompletionProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    jest.mocked(getEnvString).mockReturnValue('');
  });

  const options = {
    harmCategory: 'test-category',
    n: 1,
    purpose: 'test-purpose',
  };

  const provider = new PromptfooHarmfulCompletionProvider(options);

  it('should initialize with correct options', () => {
    expect(provider.harmCategory).toBe(options.harmCategory);
    expect(provider.n).toBe(options.n);
    expect(provider.purpose).toBe(options.purpose);
  });

  it('should return correct id', () => {
    expect(provider.id()).toBe('promptfoo:redteam:test-category');
  });

  it('should return correct string representation', () => {
    expect(provider.toString()).toBe(
      '[Promptfoo Harmful Completion Provider test-purpose - test-category]',
    );
  });

  it('should handle successful API call', async () => {
    const mockResponse = new Response(JSON.stringify({ output: 'test output' }), {
      status: 200,
      statusText: 'OK',
    });
    jest.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({ output: ['test output'] });
  });

  it('should handle API error', async () => {
    const mockResponse = new Response('API Error', {
      status: 400,
      statusText: 'Bad Request',
    });
    jest.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('[HarmfulCompletionProvider]');
  });
});

describe('PromptfooChatCompletionProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    jest.mocked(getEnvString).mockReturnValue('');
  });

  const options = {
    jsonOnly: true,
    preferSmallModel: false,
    task: 'crescendo' as const,
  };

  const provider = new PromptfooChatCompletionProvider(options);

  it('should return correct id', () => {
    expect(provider.id()).toBe('promptfoo:chatcompletion');
  });

  it('should return correct string representation', () => {
    expect(provider.toString()).toBe('[Promptfoo Chat Completion Provider]');
  });

  it('should handle successful API call', async () => {
    const mockResponse = {
      data: {
        result: 'test result',
        tokenUsage: { total: 100 },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test result',
      tokenUsage: { total: 100 },
    });
  });

  it('should handle missing result', async () => {
    const mockResponse = {
      data: {
        result: null,
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('LLM did not return a result, likely refusal');
  });

  it('should handle API error', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API Error'));

    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('API call error: Error: API Error');
  });
});

describe('PromptfooSimulatedUserProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
  });

  const options = {
    id: 'test-agent',
    instructions: 'test instructions',
  };

  const provider = new PromptfooSimulatedUserProvider(options);

  it('should return correct id', () => {
    expect(provider.id()).toBe('test-agent');
  });

  it('should return default id if not provided', () => {
    const defaultProvider = new PromptfooSimulatedUserProvider();
    expect(defaultProvider.id()).toBe('promptfoo:agent');
  });

  it('should return correct string representation', () => {
    expect(provider.toString()).toBe('[Promptfoo Agent Provider]');
  });

  it('should handle successful API call', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        result: 'test result',
        tokenUsage: { total: 100 },
      }),
      {
        status: 200,
        statusText: 'OK',
      },
    );
    jest.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

    expect(result).toEqual({
      output: 'test result',
      tokenUsage: { total: 100 },
    });
  });

  it('should handle API error response', async () => {
    const mockResponse = new Response('API Error', {
      status: 400,
      statusText: 'Bad Request',
    });
    jest.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

    expect(result.error).toContain('API call error');
  });

  it('should handle API call exception', async () => {
    jest.mocked(fetchWithRetries).mockRejectedValue(new Error('Network Error'));

    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

    expect(result.error).toBe('API call error: Error: Network Error');
  });
});
