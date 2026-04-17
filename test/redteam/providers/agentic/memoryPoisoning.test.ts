import { afterEach, beforeEach, describe, expect, it, Mocked, MockInstance, vi } from 'vitest';
import { MemoryPoisoningProvider } from '../../../../src/redteam/providers/agentic/memoryPoisoning';

import type { ApiProvider, CallApiContextParams } from '../../../../src/types/providers';

describe('MemoryPoisoningProvider', () => {
  let provider: MemoryPoisoningProvider;
  let mockTargetProvider: Mocked<ApiProvider>;
  let mockFetch: MockInstance;

  beforeEach(() => {
    provider = new MemoryPoisoningProvider({});

    mockTargetProvider = {
      id: vi.fn(),
      callApi: vi.fn(),
    };

    mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have correct ID', () => {
    expect(provider.id()).toBe('promptfoo:redteam:agentic:memory-poisoning');
  });

  it('should throw error if required context is missing', async () => {
    await expect(
      provider.callApi('test', {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
      }),
    ).rejects.toThrow('Expected originalProvider to be set');

    await expect(
      provider.callApi('test', {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
        originalProvider: mockTargetProvider,
      }),
    ).rejects.toThrow('Expected test to be set');

    await expect(
      provider.callApi('test', {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
        originalProvider: mockTargetProvider,
        test: {},
      }),
    ).rejects.toThrow('Expected purpose to be set');
  });

  it('should throw error if scenario generation fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Failed',
    } as Response);

    const context: CallApiContextParams = {
      prompt: { raw: 'test', display: 'test', label: 'test' },
      vars: {},
      originalProvider: mockTargetProvider,
      test: {
        metadata: {
          purpose: 'test purpose',
        },
      },
    };

    await expect(provider.callApi('test', context)).rejects.toThrow(
      'Failed to generate scenario: Failed',
    );
  });

  it('should execute memory poisoning flow successfully', async () => {
    const scenario = {
      memory: 'memory text',
      followUp: 'follow up text',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(scenario),
    } as Response);

    mockTargetProvider.callApi
      .mockResolvedValueOnce({ output: 'memory response' })
      .mockResolvedValueOnce({ output: 'test response' })
      .mockResolvedValueOnce({ output: 'follow up response' });

    const context: CallApiContextParams = {
      prompt: { raw: 'test', display: 'test', label: 'test' },
      vars: {},
      originalProvider: mockTargetProvider,
      test: {
        metadata: {
          purpose: 'test purpose',
        },
      },
    };

    const result = await provider.callApi('test prompt', context);

    expect(result).toMatchObject({
      output: 'follow up response',
      metadata: {
        messages: [
          { content: 'memory text', role: 'user' },
          { content: 'memory response', role: 'assistant' },
          { content: 'test prompt', role: 'user' },
          { content: 'test response', role: 'assistant' },
          { content: 'follow up text', role: 'user' },
          { content: 'follow up response', role: 'assistant' },
        ],
        redteamHistory: expect.any(Array),
      },
      tokenUsage: expect.objectContaining({
        numRequests: expect.any(Number),
      }),
    });

    expect(context.test?.metadata?.scenario).toEqual(scenario);

    expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(3);
    // Third argument is options (undefined when not provided)
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('memory text', context, undefined);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('test prompt', context, undefined);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('follow up text', context, undefined);
  });

  it('should accumulate token usage from all target provider calls', async () => {
    const scenario = {
      memory: 'memory text',
      followUp: 'follow up text',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(scenario),
    } as Response);

    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        output: 'memory response',
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'test response',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'follow up response',
        tokenUsage: { prompt: 15, completion: 8, total: 23, numRequests: 1 },
      });

    const context: CallApiContextParams = {
      prompt: { raw: 'test', display: 'test', label: 'test' },
      vars: {},
      originalProvider: mockTargetProvider,
      test: {
        metadata: {
          purpose: 'test purpose',
        },
      },
    };

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.numRequests).toBe(3);
    expect(result.tokenUsage?.prompt).toBe(45); // 10+20+15
    expect(result.tokenUsage?.completion).toBe(23); // 5+10+8
    expect(result.tokenUsage?.total).toBe(68); // 15+30+23
  });

  it('should handle errors during execution', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const context: CallApiContextParams = {
      prompt: { raw: 'test', display: 'test', label: 'test' },
      vars: {},
      originalProvider: mockTargetProvider,
      test: {
        metadata: {
          purpose: 'test purpose',
        },
      },
    };

    await expect(provider.callApi('test', context)).rejects.toThrow('Network error');
  });

  describe('Abort Signal Handling', () => {
    it('should pass abortSignal to fetchWithProxy (scenario generation)', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      const scenario = {
        memory: 'memory text',
        followUp: 'follow up text',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(scenario),
      } as Response);

      mockTargetProvider.callApi
        .mockResolvedValueOnce({ output: 'memory response' })
        .mockResolvedValueOnce({ output: 'test response' })
        .mockResolvedValueOnce({ output: 'follow up response' });

      const context: CallApiContextParams = {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
        originalProvider: mockTargetProvider,
        test: {
          metadata: {
            purpose: 'test purpose',
          },
        },
      };

      await provider.callApi('test prompt', context, options);

      // Verify fetch was called with a signal in the options (fetchWithProxy combines signals internally)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Object),
          body: expect.any(String),
          signal: expect.any(Object), // The abort signal is passed in options.signal
        }),
      );
    });

    it('should pass options to target provider callApi calls', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      const scenario = {
        memory: 'memory text',
        followUp: 'follow up text',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(scenario),
      } as Response);

      mockTargetProvider.callApi
        .mockResolvedValueOnce({ output: 'memory response' })
        .mockResolvedValueOnce({ output: 'test response' })
        .mockResolvedValueOnce({ output: 'follow up response' });

      const context: CallApiContextParams = {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
        originalProvider: mockTargetProvider,
        test: {
          metadata: {
            purpose: 'test purpose',
          },
        },
      };

      await provider.callApi('test prompt', context, options);

      // All three target provider calls should receive the options
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(3);
      expect(mockTargetProvider.callApi).toHaveBeenNthCalledWith(
        1,
        'memory text',
        context,
        options,
      );
      expect(mockTargetProvider.callApi).toHaveBeenNthCalledWith(
        2,
        'test prompt',
        context,
        options,
      );
      expect(mockTargetProvider.callApi).toHaveBeenNthCalledWith(
        3,
        'follow up text',
        context,
        options,
      );
    });

    it('should re-throw AbortError and not swallow it', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError);

      const context: CallApiContextParams = {
        prompt: { raw: 'test', display: 'test', label: 'test' },
        vars: {},
        originalProvider: mockTargetProvider,
        test: {
          metadata: {
            purpose: 'test purpose',
          },
        },
      };

      await expect(provider.callApi('test', context)).rejects.toThrow('The operation was aborted');
    });
  });
});
