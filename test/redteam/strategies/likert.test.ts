import { SingleBar } from 'cli-progress';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { addLikertTestCases } from '../../../src/redteam/strategies/likert';
import { CONNECTION_BLOCK_HINT } from '../../../src/util/fetch/errors';

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
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((extra) => ({
      'Content-Type': 'application/json',
      ...extra,
    }));
    vi.mocked(getRemoteGenerationExplicitlyDisabledError).mockImplementation(
      (strategyName) =>
        `${strategyName} requires remote generation, which has been explicitly disabled.`,
    );
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
      'Likert jailbreak strategy requires remote generation, which has been explicitly disabled.',
    );
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    vi.mocked(fetchWithCache).mockRejectedValue(networkError);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(`Error in Likert generation: ${networkError}`);
  });

  it('routes connection failures through describeFetchError (surfaces cause + network hint)', async () => {
    // Regression guard for promptfoo#9679: a dropped connection must log the
    // hidden cause AND the actionable network-block hint, not a bare
    // `TypeError: terminated`. Pins that this call site uses describeFetchError.
    const cause = Object.assign(new Error('other side closed'), {
      name: 'SocketError',
      code: 'UND_ERR_SOCKET',
    });
    const terminated = Object.assign(new TypeError('terminated'), { cause });
    vi.mocked(fetchWithCache).mockRejectedValue(terminated);

    const result = await addLikertTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    const logged = vi
      .mocked(logger.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('Cause: SocketError: other side closed');
    expect(logged).toContain(CONNECTION_BLOCK_HINT);
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
