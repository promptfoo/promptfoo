import { SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addLikertTestCases } from '../../../src/redteam/strategies/likert';
import type { TestCase } from '../../../src/types';

jest.mock('cli-progress');
jest.mock('../../../src/cache');
jest.mock('../../../src/globalConfig/accounts');
jest.mock('../../../src/redteam/remoteGeneration');

describe('likert strategy', () => {
  let mockProgressBar: jest.Mocked<SingleBar>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockProgressBar = {
      start: jest.fn(),
      increment: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<SingleBar>;
    jest.mocked(SingleBar).mockReturnValue(mockProgressBar);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    jest.mocked(getRemoteGenerationUrl).mockReturnValue('http://test.com');
    jest.mocked(neverGenerateRemote).mockReturnValue(false);
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

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(2);
    expect(result[0]?.vars?.prompt).toBe('modified prompt 1');
    expect(result[0]?.metadata?.strategy).toBe('jailbreak:likert');
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

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      '[jailbreak:likert] Error in Likert generation: API error}',
    );
  });

  it('should throw error when remote generation is disabled', async () => {
    jest.mocked(neverGenerateRemote).mockReturnValue(true);

    await expect(addLikertTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'Likert jailbreak strategy requires remote generation to be enabled',
    );
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    jest.mocked(fetchWithCache).mockRejectedValue(networkError);

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

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

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
