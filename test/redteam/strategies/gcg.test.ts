import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import { neverGenerateRemote, getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import { addGcgTestCases, CONCURRENCY } from '../../../src/redteam/strategies/gcg';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/cache');
jest.mock('../../../src/globalConfig/accounts');
jest.mock('../../../src/redteam/remoteGeneration');
jest.mock('cli-progress');

describe('gcg strategy', () => {
  const mockFetchWithCache = jest.mocked(fetchWithCache);
  const mockGetUserEmail = jest.mocked(getUserEmail);
  const mockNeverGenerateRemote = jest.mocked(neverGenerateRemote);
  const mockGetRemoteGenerationUrl = jest.mocked(getRemoteGenerationUrl);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserEmail.mockReturnValue('test@example.com');
    mockNeverGenerateRemote.mockReturnValue(false);
    mockGetRemoteGenerationUrl.mockReturnValue('http://test-url');
  });

  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'original prompt',
      },
      assert: [
        {
          type: 'equals',
          value: 'expected',
          metric: 'test-metric',
        },
      ],
    },
  ];

  it('should generate GCG test cases successfully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response 1', 'generated response 2'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result?.[0]?.vars?.prompt).toBe('generated response 1');
    expect(result?.[1]?.vars?.prompt).toBe('generated response 2');
    expect(result?.[0]?.metadata?.strategy).toBe('gcg');
    expect(result?.[0]?.assert?.[0].metric).toBe('test-metric/GCG');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'gcg',
          query: 'original prompt',
          email: 'test@example.com',
        }),
      },
      expect.any(Number),
    );
  });

  it('should throw error when remote generation is disabled', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);

    await expect(addGcgTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'GCG strategy requires remote generation to be enabled',
    );
  });

  it('should handle API errors gracefully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: { error: 'API Error' },
      cached: false,
      status: 500,
      statusText: 'Error',
    });

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith('No GCG test cases were generated');
  });

  it('should handle network errors gracefully', async () => {
    mockFetchWithCache.mockRejectedValueOnce(new Error('Network error'));

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error in GCG generation'));
  });

  it('should respect configuration options', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const config = { n: 1 };
    await addGcgTestCases(testCases, 'prompt', config);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'gcg',
          query: 'original prompt',
          n: 1,
          email: 'test@example.com',
        }),
      },
      expect.any(Number),
    );
  });

  it('should handle test cases without assert property', async () => {
    const testCasesWithoutAssert: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt',
        },
      },
    ];

    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addGcgTestCases(testCasesWithoutAssert, 'prompt', {});

    expect(result?.[0]?.vars?.prompt).toBe('generated response');
    expect(result?.[0]?.assert).toBeUndefined();
  });

  it('should maintain concurrency limit', async () => {
    const manyTestCases = Array(CONCURRENCY * 2).fill(testCases[0]);
    const mockResponses = Array(CONCURRENCY * 2).fill(['response']);

    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    mockFetchWithCache.mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCalls--;
      return {
        data: { responses: mockResponses[0] },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });

    await addGcgTestCases(manyTestCases, 'prompt', {});

    expect(maxConcurrentCalls).toBeLessThanOrEqual(CONCURRENCY);
  });
});
