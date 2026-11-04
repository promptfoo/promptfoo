import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import {
  fetchHuggingFaceDataset,
  parseDatasetPath,
} from '../../src/integrations/huggingfaceDatasets';
import { createMockFetchResponse } from '../providers/mockProviderResponses';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../src/util/fetch/index.ts', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn().mockReturnValue(''),
  isCI: vi.fn().mockReturnValue(false),
}));

describe('huggingfaceDatasets', () => {
  beforeEach(() => {
    vi.mocked(getEnvString).mockReturnValue('');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('parseDatasetPath', () => {
    it('should parse path with default parameters', () => {
      const result = parseDatasetPath('huggingface://datasets/owner/repo');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        queryParams: expect.any(URLSearchParams),
      });
      expect(result.queryParams.get('split')).toBe('test');
      expect(result.queryParams.get('config')).toBe('default');
    });

    it('should parse path with custom query parameters', () => {
      const result = parseDatasetPath(
        'huggingface://datasets/owner/repo?split=train&config=custom&limit=10',
      );
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        queryParams: expect.any(URLSearchParams),
      });
      expect(result.queryParams.get('split')).toBe('train');
      expect(result.queryParams.get('config')).toBe('custom');
      expect(result.queryParams.get('limit')).toBe('10');
    });

    it('should override default parameters with user parameters', () => {
      const result = parseDatasetPath('huggingface://datasets/owner/repo?split=validation');
      expect(result.queryParams.get('split')).toBe('validation');
      expect(result.queryParams.get('config')).toBe('default');
    });
  });

  it('should fetch and parse dataset with default parameters', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 2,
        features: [
          { name: 'act', type: { dtype: 'string', _type: 'Value' } },
          { name: 'prompt', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [
          { row: { act: 'Linux Terminal', prompt: 'List all files' } },
          { row: { act: 'Math Tutor', prompt: 'Solve 2+2' } },
        ],
      }) as any,
    );

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(2);
    expect(tests[0].vars).toEqual({
      act: 'Linux Terminal',
      prompt: 'List all files',
    });
    expect(tests[1].vars).toEqual({
      act: 'Math Tutor',
      prompt: 'Solve 2+2',
    });

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should include auth token when HF_TOKEN is set', async () => {
    vi.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return 'test-token';
      }
      return '';
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 1,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [{ row: { question: 'What is 2+2?', answer: '4' } }],
      }) as any,
    );

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });

  it('should fall back to HF_API_TOKEN when HF_TOKEN is empty', async () => {
    vi.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return '';
      }
      if (key === 'HF_API_TOKEN') {
        return 'api-token';
      }
      return '';
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 1,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'test' } }],
      }) as any,
    );

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 1);

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer api-token',
        },
      }),
    );
  });

  it('should fall back to HUGGING_FACE_HUB_TOKEN when other tokens are empty', async () => {
    vi.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return '';
      }
      if (key === 'HF_API_TOKEN') {
        return '';
      }
      if (key === 'HUGGING_FACE_HUB_TOKEN') {
        return 'hub-token';
      }
      return '';
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 1,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'test' } }],
      }) as any,
    );

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 1);

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer hub-token',
        },
      }),
    );
  });

  it('should handle custom query parameters', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 1,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [{ row: { question: 'What is 2+2?', answer: '4' } }],
      }) as any,
    );

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?split=train&config=custom');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=train&config=custom&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
  });

  it('should handle pagination', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
      }) as any,
    );

    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'Third' } }],
      }) as any,
    );

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      1,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
    // Note: Second call might have different length due to concurrent fetching and remaining calculation
    expect(vi.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('dataset=test%2Fdataset&split=test&config=default&offset=2'),
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(3);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second', 'Third']);

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should reject an empty non-final page instead of retrying the same offset', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(
        createMockFetchResponse({
          num_rows_total: 2,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: [],
        }) as any,
      )
      .mockRejectedValueOnce(new Error('Paginator retried the empty page'));

    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 200),
    ).rejects.toThrow(
      '[HF Dataset] Received an empty page at offset 0 before reaching 2 total rows',
    );

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledTimes(1);
  });

  it('should handle API errors by throwing', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse(null, { status: 404, statusText: 'Not Found' }) as any,
    );

    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/nonexistent/dataset'),
    ).rejects.toThrow('[HF Dataset] Failed to fetch dataset: Not Found');
  });

  it('should short-circuit and return [] when limit is 0', async () => {
    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 0);
    expect(vi.mocked(fetchWithCache)).not.toHaveBeenCalled();
    expect(tests).toEqual([]);
  });

  it.each(['foo', '2foo', '-1', '1.5', 'NaN', 'Infinity', '1e309', '', ' '])(
    'should reject invalid query limit %j before fetching',
    async (limit) => {
      await expect(
        fetchHuggingFaceDataset(
          `huggingface://datasets/test/dataset?limit=${encodeURIComponent(limit)}`,
        ),
      ).rejects.toThrow('[HF Dataset] Invalid limit: expected a finite non-negative integer');

      expect(fetchWithCache).not.toHaveBeenCalled();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'should reject invalid explicit limit %s before fetching even with a valid query limit',
    async (limit) => {
      await expect(
        fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=2', limit),
      ).rejects.toThrow('[HF Dataset] Invalid limit: expected a finite non-negative integer');

      expect(fetchWithCache).not.toHaveBeenCalled();
    },
  );

  it('should short-circuit and return [] when the query limit is 0', async () => {
    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=0'),
    ).resolves.toEqual([]);

    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should use an explicit zero limit instead of an invalid query limit', async () => {
    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=foo', 0),
    ).resolves.toEqual([]);

    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each(['0', '5', 'foo'])(
    'should prefer an explicit limit to the query limit %j',
    async (queryLimit) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          num_rows_total: 5,
          features: [],
          rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const tests = await fetchHuggingFaceDataset(
        `huggingface://datasets/test/dataset?limit=${queryLimit}`,
        2,
      );

      expect(fetchWithCache).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('&offset=0&length=2'),
        expect.objectContaining({ headers: {} }),
      );
      expect(tests.map((test) => test.vars?.text)).toEqual(['First', 'Second']);
    },
  );

  it('should respect user-specified limit parameter (single request optimization)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 5,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
      }) as any,
    );

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=2');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=2&offset=0&length=2',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(2);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second']);

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should handle limit larger than page size', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(100)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
      }) as any,
    );

    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(20)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 101}` } })),
      }) as any,
    );

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=120');

    expect(vi.mocked(fetchWithCache)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      1,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=120&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
    expect(vi.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      2,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=120&offset=100&length=20',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(120);
    expect(tests[119].vars?.text).toBe('Item 120');

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  describe('performance optimizations', () => {
    it('should use single request optimization for small limits', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse(
          {
            num_rows_total: 1000,
            features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
            rows: Array(50)
              .fill(null)
              .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
          },
          { cached: true },
        ) as any,
      );

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 50);

      // Should only make one request for limits <= 100
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledTimes(1);
      expect(tests).toHaveLength(50);
    });

    it('should throw error on page fetch failure', async () => {
      // First page succeeds
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          num_rows_total: 300,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(100)
            .fill(null)
            .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
        }) as any,
      );

      // Second page fails
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse(null, { status: 500, statusText: 'Internal Server Error' }) as any,
      );

      // Should throw error instead of returning partial results
      await expect(
        fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 200),
      ).rejects.toThrow('[HF Dataset] Failed to fetch dataset: Internal Server Error');
    });

    it('should include rows from concurrent fetches without duplicates', async () => {
      const totalRows = 400;
      const rowPrefix = 'x'.repeat(300);

      vi.mocked(fetchWithCache).mockImplementation(async (url) => {
        const searchParams = new URL(String(url)).searchParams;
        const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
        const length = Number.parseInt(searchParams.get('length') ?? '100', 10);

        return createMockFetchResponse({
          num_rows_total: totalRows,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array.from({ length }, (_, i) => ({
            row: { text: `${rowPrefix}${offset + i + 1}` },
          })),
        }) as any;
      });

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');
      const texts = tests.map((test) => test.vars?.text);
      const calledOffsets = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'));

      expect(calledOffsets).toContain('100');
      expect(tests).toHaveLength(totalRows);
      expect(texts).toContain(`${rowPrefix}150`);
      expect(new Set(texts).size).toBe(totalRows);
    });

    describe('when a prefetched page is unusable', () => {
      const totalRows = 400;
      // ~300-byte rows keep the page size at 100, so offsets 100 and 200 are prefetched together
      const rowPrefix = 'x'.repeat(300);
      const unavailable = {
        data: null,
        cached: false,
        status: 503,
        statusText: 'Service Unavailable',
      };
      const emptyPage = {
        data: {
          num_rows_total: totalRows,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: [],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      function servePages(unusablePage: object, unusableRequests: number) {
        let served = 0;
        vi.mocked(fetchWithCache).mockImplementation(async (url) => {
          const searchParams = new URL(String(url)).searchParams;
          const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
          const length = Number.parseInt(searchParams.get('length') ?? '100', 10);

          if (offset === 100 && served < unusableRequests) {
            served++;
            return unusablePage as any;
          }

          return {
            data: {
              num_rows_total: totalRows,
              features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
              rows: Array.from({ length }, (_, i) => ({
                row: { text: `${rowPrefix}${offset + i + 1}` },
              })),
            },
            cached: false,
            status: 200,
            statusText: 'OK',
          } as any;
        });
      }

      it.each([
        ['fails once', unavailable],
        ['comes back empty once', emptyPage],
      ])('should load the rows in order without gaps or duplicates when it %s', async (_, page) => {
        servePages(page, 1);

        const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

        expect(tests.map((test) => test.vars?.text)).toEqual(
          Array.from({ length: totalRows }, (_, i) => `${rowPrefix}${i + 1}`),
        );
      });

      it('should throw instead of leaving a gap when it keeps failing', async () => {
        servePages(unavailable, Infinity);

        await expect(
          fetchHuggingFaceDataset('huggingface://datasets/test/dataset'),
        ).rejects.toThrow('[HF Dataset] Failed to fetch dataset: Service Unavailable');
      });
    });

    it('should adapt page size based on row size', async () => {
      // Mock a dataset with large rows (>2KB each)
      const largeRow = { text: 'x'.repeat(3000) }; // ~3KB row

      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          num_rows_total: 200,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(100)
            .fill(null)
            .map(() => ({ row: largeRow })),
        }) as any,
      );

      // Mock all subsequent potential concurrent requests to avoid undefined errors
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          num_rows_total: 200,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(25)
            .fill(null)
            .map((_, i) => ({ row: { text: `Item ${i + 101}` } })),
        }) as any,
      );

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 125);

      // Should have made at least one request
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalled();

      // First call should be normal page size
      expect(vi.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('length=100'),
        expect.anything(),
      );

      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0].vars?.text).toBe(largeRow.text);
    });

    it('should keep small-row pages at the 100-row maximum the datasets server allows', async () => {
      const rows = Array.from({ length: 546 }, (_, i) => ({ row: { text: `Item ${i + 1}` } }));

      vi.mocked(fetchWithCache).mockImplementation(async (url) => {
        const searchParams = new URL(String(url)).searchParams;
        const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
        const length = Number.parseInt(searchParams.get('length') ?? '100', 10);

        // Like the real server, reject a page longer than 100 rows
        if (length > 100) {
          return {
            data: { error: "Parameter 'length' must not be greater than 100" },
            cached: false,
            status: 422,
            statusText: 'Unprocessable Entity',
          } as any;
        }

        return {
          data: {
            num_rows_total: rows.length,
            features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
            rows: rows.slice(offset, offset + length),
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        } as any;
      });

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');
      const requestedLengths = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([url]) => new URL(String(url)).searchParams.get('length'));

      expect(requestedLengths).toEqual(['100', '100', '100', '100', '100', '46']);
      expect(tests.map((test) => test.vars)).toEqual(rows.map(({ row }) => row));
    });

    it('should handle authentication tokens correctly', async () => {
      vi.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'HF_TOKEN') {
          return 'test-token-123';
        }
        return '';
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          num_rows_total: 10,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: [{ row: { text: 'Test' } }],
        }) as any,
      );

      await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 5);

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token-123',
          },
        }),
      );
    });
  });
});
