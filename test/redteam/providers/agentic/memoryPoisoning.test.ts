import { MemoryPoisoningProvider } from '../../../../src/redteam/providers/agentic/memoryPoisoning';

import type { ApiProvider, CallApiContextParams } from '../../../../src/types/providers';

describe('MemoryPoisoningProvider', () => {
  let provider: MemoryPoisoningProvider;
  let mockTargetProvider: jest.Mocked<ApiProvider>;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    provider = new MemoryPoisoningProvider({});

    mockTargetProvider = {
      id: jest.fn(),
      callApi: jest.fn(),
    };

    mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    jest.resetAllMocks();
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

    expect(result).toEqual({
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
    });

    expect(context.test?.metadata?.scenario).toEqual(scenario);

    expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(3);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('memory text', context);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('test prompt', context);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith('follow up text', context);
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
});
