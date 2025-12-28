import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addCitationTestCases } from '../../../src/redteam/strategies/citation';

import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/cache');
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('cli-progress');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: 'info',
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

describe('citation strategy', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockGetUserEmail = vi.mocked(getUserEmail);
  const mockNeverGenerateRemote = vi.mocked(neverGenerateRemote);
  const mockGetRemoteGenerationUrl = vi.mocked(getRemoteGenerationUrl);

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should generate citation test cases successfully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        result: {
          topic: 'test topic',
          key: 'test key',
          citation: {
            type: 'Journal Article',
            content: 'Smith, J. (2024). Test Article. Journal of Testing, 1(1), 1-10.',
          },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCitationTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(result[0]?.vars?.prompt).toContain('Based on the following journal article');
    expect(result[0]?.vars?.prompt).toContain('Smith, J. (2024)');
    expect(result[0]?.metadata?.strategyId).toBe('citation');
    expect(result[0]?.metadata?.citation).toEqual({
      type: 'Journal Article',
      content: 'Smith, J. (2024). Test Article. Journal of Testing, 1(1), 1-10.',
    });
    expect(result[0]?.assert?.[0].metric).toBe('test-metric/Citation');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'citation',
          testCases: [testCases[0]],
          injectVar: 'prompt',
          topic: 'original prompt',
          config: {},
          email: 'test@example.com',
        }),
      },
      expect.any(Number),
    );
  });

  it('should throw error when remote generation is disabled', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);

    await expect(addCitationTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'Citation strategy requires remote generation to be enabled',
    );
  });

  it('should handle API errors gracefully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        error: 'Validation error: Required at "result.topic"; Required at "result.citation"',
      },
      cached: false,
      status: 500,
      statusText: 'Error',
    });

    const result = await addCitationTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[Citation] Error in citation generation'),
    );
    expect(logger.warn).toHaveBeenCalledWith('No citation test cases were generated');
  });

  it('should handle invalid response structure gracefully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        result: {
          topic: 'test topic',
          // missing citation field
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCitationTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      '[Citation] Invalid response structure - missing citation data',
    );
    expect(logger.warn).toHaveBeenCalledWith('No citation test cases were generated');
  });

  it('should handle network errors gracefully', async () => {
    mockFetchWithCache.mockRejectedValueOnce(new Error('Network error'));

    const result = await addCitationTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in remote citation generation'),
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
        result: {
          topic: 'test topic',
          key: 'test key',
          citation: {
            type: 'Book',
            content: 'Author, A. (2024). Test Book. Publisher.',
          },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCitationTestCases(testCasesWithoutAssert, 'prompt', {});

    expect(result[0]?.vars?.prompt).toContain('Based on the following book');
    expect(result[0]?.assert).toBeUndefined();
  });

  it('should preserve original text in metadata', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        result: {
          topic: 'test topic',
          key: 'test key',
          citation: {
            type: 'Website',
            content: 'Example.com. (2024). Test Page. https://example.com',
          },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addCitationTestCases(testCases, 'prompt', {});

    expect(result[0]?.metadata?.originalText).toBe('original prompt');
  });
});
