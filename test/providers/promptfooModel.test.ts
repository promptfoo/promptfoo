import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { PromptfooModelProvider } from '../../src/providers/promptfooModel';
import type { Mock } from 'vitest';

describe('PromptfooModelProvider', () => {
  let mockFetch: Mock;
  let mockCloudConfig: ReturnType<typeof vi.spyOn>;
  const mockLogger = vi.spyOn(logger, 'debug').mockImplementation(function () {});

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockCloudConfig = vi.spyOn(cloudConfig, 'getRequestConfig').mockReturnValue({
      apiHost: 'https://api.promptfoo.app',
      authHeaderName: 'Authorization',
      headers: { Authorization: 'Bearer test-token' },
      teamId: undefined,
    });
    mockLogger.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('should initialize with model name', () => {
    const provider = new PromptfooModelProvider('test-model');
    expect(provider.id()).toBe('promptfoo:model:test-model');
  });

  it('should throw error if model name is not provided', () => {
    expect(() => new PromptfooModelProvider('')).toThrow('Model name is required');
  });

  it('should call API with string prompt', async () => {
    const provider = new PromptfooModelProvider('test-model');
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test response' } }],
            usage: {
              total_tokens: 10,
              prompt_tokens: 5,
              completion_tokens: 5,
            },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
        numRequests: 1,
      },
    });
  });

  it('keeps the host, custom credential, and task team from one captured session', async () => {
    mockCloudConfig.mockReturnValueOnce({
      apiHost: 'https://captured.example.com',
      authHeaderName: 'X-Captured-Auth',
      headers: { 'X-Captured-Auth': 'Bearer captured-token' },
      teamId: 'captured-team',
    });
    // Any later saved-session read returns a different host and credential.
    mockCloudConfig.mockReturnValue({
      apiHost: 'https://new.example.com',
      authHeaderName: 'X-New-Auth',
      headers: { 'X-New-Auth': 'Bearer new-token' },
      teamId: 'new-team',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { choices: [{ message: { content: 'response' } }] } }),
    });

    await new PromptfooModelProvider('test-model').callApi('test prompt');

    expect(mockCloudConfig).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://captured.example.com/api/v1/task',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Captured-Auth': 'Bearer captured-token',
          'x-promptfoo-team-id': 'captured-team',
        }),
      }),
    );
    expect(new Headers(mockFetch.mock.calls[0][1].headers).has('X-New-Auth')).toBe(false);
  });

  it('should handle JSON array messages', async () => {
    const provider = new PromptfooModelProvider('test-model');
    const messages = JSON.stringify([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);

    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    await provider.callApi(messages);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(
          '"messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi"}]',
        ),
      }),
    );
  });

  it('should throw error if no auth token', async () => {
    mockCloudConfig.mockReturnValue({
      apiHost: 'https://api.promptfoo.app',
      authHeaderName: 'Authorization',
      headers: undefined,
      teamId: undefined,
    });
    const provider = new PromptfooModelProvider('test-model');

    await expect(provider.callApi('test')).rejects.toThrow('No Promptfoo auth token available');
  });

  it('should handle API errors', async () => {
    const provider = new PromptfooModelProvider('test-model');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });

    await expect(provider.callApi('test')).rejects.toThrow('PromptfooModel task API error: 500');
  });

  it('should handle invalid API responses', async () => {
    const provider = new PromptfooModelProvider('test-model');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'Invalid response from PromptfooModel task API',
    );
  });

  it('should use config from options', async () => {
    const config = { temperature: 0.7 };
    const provider = new PromptfooModelProvider('test-model', { model: 'test-model', config });

    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    await provider.callApi('test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"config":{"temperature":0.7}'),
      }),
    );
  });
});
