import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvBool, getEnvString } from '../../src/envars';
import { getUserEmail } from '../../src/globalConfig/accounts';
import {
  PromptfooChatCompletionProvider,
  PromptfooHarmfulCompletionProvider,
  PromptfooSimulatedUserProvider,
  REDTEAM_SIMULATED_USER_TASK_ID,
} from '../../src/providers/promptfoo';
import { fetchWithRetries } from '../../src/util/fetch/index';

vi.mock('../../src/cache');
vi.mock('../../src/envars');
vi.mock('../../src/util/fetch/index.ts');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    CloudConfig: class {
      isEnabled() {
        return false;
      }
      getApiHost() {
        return 'https://api.promptfoo.app';
      }
    },
  };
});

describe('PromptfooHarmfulCompletionProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserEmail).mockImplementation(function () {
      return 'test@example.com';
    });
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(getEnvBool).mockImplementation(function () {
      return false;
    });
  });

  const options = {
    harmCategory: 'test-category',
    n: 1,
    purpose: 'test-purpose',
  };

  let provider: PromptfooHarmfulCompletionProvider;

  beforeEach(() => {
    provider = new PromptfooHarmfulCompletionProvider(options);
  });

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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({ output: ['test output'] });
  });

  it('should filter out null and undefined values from output array', async () => {
    const mockResponse = new Response(
      JSON.stringify({ output: ['value1', null, 'value2', undefined] }),
      {
        status: 200,
        statusText: 'OK',
      },
    );
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({ output: ['value1', 'value2'] });
  });

  it('should handle null output by returning empty array', async () => {
    const mockResponse = new Response(JSON.stringify({ output: null }), {
      status: 200,
      statusText: 'OK',
    });
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({ output: [] });
  });

  it('should handle API error', async () => {
    const mockResponse = new Response('API Error', {
      status: 400,
      statusText: 'Bad Request',
    });
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('[HarmfulCompletionProvider]');
  });

  it('should return error when PROMPTFOO_DISABLE_REMOTE_GENERATION is set', async () => {
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain('Harmful content generation requires');
    expect(result.error).toContain('PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should return error when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set', async () => {
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION';
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain('Harmful content generation requires');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should pass abortSignal to fetchWithRetries', async () => {
    const abortController = new AbortController();
    const mockResponse = new Response(JSON.stringify({ output: 'test output' }), {
      status: 200,
      statusText: 'OK',
    });
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    await provider.callApi('test prompt', undefined, { abortSignal: abortController.signal });

    expect(fetchWithRetries).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortController.signal }),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('should re-throw AbortError and not swallow it', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetchWithRetries).mockRejectedValue(abortError);

    await expect(provider.callApi('test prompt')).rejects.toThrow('The operation was aborted');
  });
});

describe('PromptfooChatCompletionProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserEmail).mockImplementation(function () {
      return 'test@example.com';
    });
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(getEnvBool).mockImplementation(function () {
      return false;
    });
  });

  const options = {
    jsonOnly: true,
    preferSmallModel: false,
    task: 'crescendo' as const,
  };

  let provider: PromptfooChatCompletionProvider;

  beforeEach(() => {
    provider = new PromptfooChatCompletionProvider(options);
  });

  it('should return correct id', () => {
    expect(provider.id()).toBe('promptfoo:chatcompletion');
  });

  it('should return correct string representation', () => {
    expect(provider.toString()).toBe('[Promptfoo Chat Completion Provider]');
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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test result',
      tokenUsage: { total: 100 },
    });
  });

  it('should handle missing result', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        result: null,
      }),
      {
        status: 200,
        statusText: 'OK',
      },
    );
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('LLM did not return a result, likely refusal');
  });

  it('should handle API error', async () => {
    vi.mocked(fetchWithRetries).mockRejectedValue(new Error('API Error'));

    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should return error when PROMPTFOO_DISABLE_REMOTE_GENERATION is set', async () => {
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain('This red team strategy requires');
    expect(result.error).toContain('PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should return error when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set', async () => {
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION';
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain('This red team strategy requires');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should pass abortSignal to fetchWithRetries', async () => {
    const abortController = new AbortController();
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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    await provider.callApi('test prompt', undefined, { abortSignal: abortController.signal });

    // Verify the signal was passed in the options object
    expect(fetchWithRetries).toHaveBeenCalled();
    const callArgs = vi.mocked(fetchWithRetries).mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal', abortController.signal);
  });

  it('should re-throw AbortError and not swallow it', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetchWithRetries).mockRejectedValue(abortError);

    await expect(provider.callApi('test prompt')).rejects.toThrow('The operation was aborted');
  });
});

describe('PromptfooSimulatedUserProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserEmail).mockImplementation(function () {
      return 'test@example.com';
    });
    vi.mocked(getEnvBool).mockImplementation(function () {
      return false;
    });
  });

  const options = {
    id: 'test-agent',
    instructions: 'test instructions',
  };

  let provider: PromptfooSimulatedUserProvider;

  beforeEach(() => {
    provider = new PromptfooSimulatedUserProvider(options, 'test-id');
  });

  it('should return correct id', () => {
    expect(provider.id()).toBe('test-agent');
  });

  it('should return default id if not provided', () => {
    const defaultProvider = new PromptfooSimulatedUserProvider({}, 'test-id');
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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

    expect(result.error).toContain('API call error');
  });

  it('should handle API call exception', async () => {
    vi.mocked(fetchWithRetries).mockRejectedValue(new Error('Network Error'));

    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

    expect(result.error).toBe('API call error: Error: Network Error');
  });

  it('should return error when PROMPTFOO_DISABLE_REMOTE_GENERATION is set for regular task', async () => {
    const regularProvider = new PromptfooSimulatedUserProvider({}, 'tau');
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
    });

    const result = await regularProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain('SimulatedUser requires');
    expect(result.error).toContain('PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should NOT be disabled when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set for regular task', async () => {
    const regularProvider = new PromptfooSimulatedUserProvider({}, 'tau');
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION';
    });

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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    const result = await regularProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('test result');
    expect(fetchWithRetries).toHaveBeenCalled();
  });

  it('should return error when PROMPTFOO_DISABLE_REMOTE_GENERATION is set for redteam task', async () => {
    const redteamProvider = new PromptfooSimulatedUserProvider({}, REDTEAM_SIMULATED_USER_TASK_ID);
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
    });

    const result = await redteamProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain(
      'PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION',
    );
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should return error when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set for redteam task', async () => {
    const redteamProvider = new PromptfooSimulatedUserProvider({}, REDTEAM_SIMULATED_USER_TASK_ID);
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION';
    });

    const result = await redteamProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );

    expect(result.error).toContain('Remote generation is disabled');
    expect(result.error).toContain(
      'PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION',
    );
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should show integration: regular SimulatedUser works while redteam is disabled', async () => {
    // This is the key feature: PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION should
    // NOT affect regular (non-redteam) SimulatedUser tasks
    const regularProvider = new PromptfooSimulatedUserProvider({}, 'tau');
    const redteamProvider = new PromptfooSimulatedUserProvider({}, REDTEAM_SIMULATED_USER_TASK_ID);

    // Set only the redteam-specific flag
    vi.mocked(getEnvBool).mockImplementation(function (key: string) {
      return key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION';
    });

    const mockResponse = new Response(
      JSON.stringify({
        result: 'regular user response',
        tokenUsage: { total: 50 },
      }),
      {
        status: 200,
        statusText: 'OK',
      },
    );
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    // Regular task should work
    const regularResult = await regularProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );
    expect(regularResult.error).toBeUndefined();
    expect(regularResult.output).toBe('regular user response');
    expect(fetchWithRetries).toHaveBeenCalled();

    // Reset fetch mock
    vi.mocked(fetchWithRetries).mockClear();

    // Redteam task should be blocked
    const redteamResult = await redteamProvider.callApi(
      JSON.stringify([{ role: 'user', content: 'hello' }]),
    );
    expect(redteamResult.error).toContain('Remote generation is disabled');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('should pass abortSignal to fetchWithRetries', async () => {
    const abortController = new AbortController();
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
    vi.mocked(fetchWithRetries).mockResolvedValue(mockResponse);

    await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]), undefined, {
      abortSignal: abortController.signal,
    });

    // Verify the signal was passed in the options object
    expect(fetchWithRetries).toHaveBeenCalled();
    const callArgs = vi.mocked(fetchWithRetries).mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal', abortController.signal);
  });

  it('should re-throw AbortError and not swallow it', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetchWithRetries).mockRejectedValue(abortError);

    await expect(
      provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }])),
    ).rejects.toThrow('The operation was aborted');
  });
});
