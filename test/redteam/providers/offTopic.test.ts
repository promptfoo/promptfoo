import logger from '../../../src/logger';
import { ServerOffTopicProvider } from '../../../src/redteam/providers/offTopic';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';

jest.mock('../../../src/logger');
jest.mock('crypto', () => ({
  randomBytes: () => ({
    toString: () => 'mock-random',
  }),
}));

describe('ServerOffTopicProvider', () => {
  let provider: ServerOffTopicProvider;
  let mockFetch: jest.SpyInstance;
  const mockOriginalProvider = {
    id: () => 'mock-provider',
    callApi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ServerOffTopicProvider({});
    mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
  });

  it('should initialize with correct sessionId', () => {
    expect(provider['sessionId']).toMatch(/^session_\d+_mock-random$/);
  });

  it('should return correct provider id', () => {
    expect(provider.id()).toBe('promptfoo:redteam:off-topic');
  });

  it('should format message content correctly', () => {
    expect(provider['formatMessageContent']('test')).toBe('test');
    expect(provider['formatMessageContent']({ key: 'value' })).toBe('{"key":"value"}');
    const obj = Object.create(null);
    expect(provider['formatMessageContent'](obj)).toBe('{}');
  });

  it('should throw error if originalProvider is not set', async () => {
    await expect(provider.callApi('test')).rejects.toThrow('Expected originalProvider to be set');
  });

  it('should handle successful conversation flow', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        message: { content: 'test message' },
        state: {
          currentPhase: 1,
          deviationAttempts: 1,
          successfulDeviation: false,
        },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    mockOriginalProvider.callApi.mockResolvedValue({ output: 'model response' });

    const result = await provider.callApi('test prompt', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
      test: { metadata: { purpose: 'test purpose' } },
    });

    expect(result.output).toBe('model response');
    expect(result.metadata).toHaveProperty('messages');
    expect(result.metadata).toHaveProperty('sessionId');
    expect(result.metadata).toHaveProperty('roundsCompleted');
    expect(mockFetch).toHaveBeenCalledWith(getRemoteGenerationUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
  });

  it('should handle server errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      provider.callApi('test', {
        originalProvider: mockOriginalProvider,
        prompt: { raw: 'test', label: 'test' },
        vars: {},
      }),
    ).rejects.toThrow('Server responded with status 500');

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error in conversation'));
  });

  it('should complete conversation when phase >= 3', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        message: { content: 'test message' },
        state: {
          currentPhase: 3,
          deviationAttempts: 1,
          successfulDeviation: false,
        },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockOriginalProvider.callApi.mockResolvedValue({ output: 'model response' });

    const result = await provider.callApi('test', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.metadata.roundsCompleted).toBe(1);
  });

  it('should complete conversation on successful deviation', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        message: { content: 'test message' },
        state: {
          currentPhase: 1,
          deviationAttempts: 1,
          successfulDeviation: true,
        },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockOriginalProvider.callApi.mockResolvedValue({ output: 'model response' });

    const result = await provider.callApi('test', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.metadata.roundsCompleted).toBe(1);
  });

  it('should respect MAX_ROUNDS limit', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        message: { content: 'test message' },
        state: {
          currentPhase: 1,
          deviationAttempts: 1,
          successfulDeviation: false,
        },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockOriginalProvider.callApi.mockResolvedValue({ output: 'model response' });

    const result = await provider.callApi('test', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.metadata.roundsCompleted).toBeLessThanOrEqual(10);
  });

  it('should handle server completion signal', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        done: true,
        message: { content: 'test message' },
        state: {
          currentPhase: 1,
          deviationAttempts: 1,
          successfulDeviation: false,
        },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockOriginalProvider.callApi.mockResolvedValue({ output: 'model response' });

    const result = await provider.callApi('test', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.metadata.roundsCompleted).toBe(1);
  });
});
