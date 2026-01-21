import { SingleBar } from 'cli-progress';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addLikertTestCases } from '../../../src/redteam/strategies/likert';

import type { TestCase } from '../../../src/types/index';

vi.mock('cli-progress');
vi.mock('../../../src/cache');
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

describe('likert strategy', () => {
  let mockProgressBar: Mocked<SingleBar>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProgressBar = {
      start: vi.fn(),
      increment: vi.fn(),
      stop: vi.fn(),
    } as unknown as Mocked<SingleBar>;
    vi.mocked(SingleBar).mockImplementation(function () {
      return mockProgressBar;
    });
    vi.mocked(getUserEmail).mockImplementation(function () {
      return 'test@example.com';
    });
    vi.mocked(getRemoteGenerationUrl).mockImplementation(function () {
      return 'http://test.com';
    });
    vi.mocked(neverGenerateRemote).mockImplementation(function () {
      return false;
    });
  });

  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'test prompt 1',
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

  it('should generate likert test cases successfully', async () => {
    const mockResponse = {
      data: {
        modifiedPrompts: ['modified prompt 1', 'modified prompt 2'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(2);
    expect(result[0]?.vars?.prompt).toBe('modified prompt 1');
    expect(result[0]?.metadata?.strategyId).toBe('jailbreak:likert');
    expect(result[0]?.assert?.[0].metric).toBe('test-metric/Likert');
  });

  it('should handle API errors gracefully', async () => {
    const mockResponse = {
      data: {
        error: 'API error',
      },
      cached: false,
      status: 500,
      statusText: 'Error',
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      '[jailbreak:likert] Error in Likert generation: API error}',
    );
  });

  it('should throw error when remote generation is disabled', async () => {
    vi.mocked(neverGenerateRemote).mockImplementation(function () {
      return true;
    });

    await expect(addLikertTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'Likert jailbreak strategy requires remote generation to be enabled',
    );
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    vi.mocked(fetchWithCache).mockRejectedValue(networkError);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(`Error in Likert generation: ${networkError}`);
  });

  it('should handle empty test cases', async () => {
    const result = await addLikertTestCases([], 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith('No Likert jailbreak test cases were generated');
  });

  it('should include user email in payload', async () => {
    const mockResponse = {
      data: {
        modifiedPrompts: ['modified'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    await addLikertTestCases(testCases, 'prompt', {});

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('test@example.com'),
      },
      expect.any(Number),
    );
  });
});
